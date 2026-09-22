import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { COMMAND_EXCLUDED_ACTIONS, COMMAND_TASKS, OPS_ACTIONS, OPS_ACTION_KEYS, SETTING_KEYS, type OpsAction } from '@sitekit/shared';
import { env } from '../../config/env';
import { OpsService } from '../ops/ops.service';
import { SettingsService } from '../settings/settings.service';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}
export interface PendingStep {
  action: OpsAction;
  params: Record<string, unknown>;
  desc: string;
}
export interface CommandResult {
  reply: string;
  /** 已即時執行的唯讀動作 */
  executed: { action: string; params: Record<string, unknown>; ok: boolean; data?: unknown; error?: string }[];
  /** 待人工確認的寫入動作 */
  pending: PendingStep[];
  token?: string;
  provider: string;
  model: string;
}

/** 動作參數提示（給模型的工具說明；OPS_ACTIONS.desc 之外的補充） */
const TOOL_HINTS: Partial<Record<OpsAction, string>> = {
  upsert_content: '參數：slug(必填)、type page|post、title、body(HTML) 或 design(設計文件 JSON)、excerpt、coverUrl。design 格式：{"root":{"type":"root","children":[{"type":"section","props":{"contentWidth":"1100px"},"style":{"base":{"padding":"64px 24px","background":"#111827","color":"#fff","textAlign":"center"}},"children":[{"type":"heading","props":{"level":1,"text":"標題"}},{"type":"text","props":{"text":"副標"}},{"type":"image","props":{"src":"https://…","alt":"…"}},{"type":"button","props":{"text":"按鈕","href":"/store","variant":"primary"}}]}]}}；可用類型 section/container/columns(props.cols)/column/heading/text/richtext(props.html)/button/spacer/divider/image/video/embed(props.url)/quote/list(props.items[])/iconbox(icon,title,text)/card(image,title,text,buttonText,href)/faq(items[{q,a}])/html/products/courses/posts(props.limit,title)。style 可有 base/tablet/mobile 三組 CSS（camelCase）。首頁 slug=home。',
  publish_content: '參數：idOrSlug、confirm(true)、note。只有使用者在指令台確認後才會執行。',
  preview_content: '參數：idOrSlug。回沙盒預覽網址，請把網址給使用者。',
  get_content_draft: '參數：idOrSlug。',
  restore_revision: '參數：idOrSlug、version。',
  import_page_design: '參數：slug、title、type、design。',
  export_page_design: '參數：idOrSlug。',
  set_home_sections: '參數：sections[]（kind hero|features|courses|products|posts|html|cta …）。首頁若有 slug=home 的已發佈設計頁，會優先於 sections。',
  set_menu: '參數：location header|footer、items[{label,kind page|route|link,contentId|href,children[]}]。',
  get_menu: '參數：location。',
  sales_report: '參數：from、to（YYYY-MM-DD）、groupBy day|month。',
  update_shipping: '參數：orderNo、status pending|shipped|delivered|returned、carrier、trackingNo。',
  manage_coupon: '參數：op create|update|disable、code、type percent|fixed、value、minAmount、maxUses、expiresAt。',
  adjust_stock: '參數：sku、set 或 delta。',
  expire_orders: '參數：hours。',
  create_logistics_order: '參數：orderNo（需已付款）。',
  issue_invoice: '參數：orderNo。',
  invalidate_invoice: '參數：orderNo、reason。',
  list_invoices: '參數：status、limit。',
  answer_question: '參數：id、answer。',
  post_announcement: '參數：slug（課程）、title、body。',
  import_products: '參數：csv（字串）、dryRun。',
  list_content: '參數：type、status。',
  list_questions: '參數：status open|answered。',
  generate_image: '參數：prompt（英文描述效果較好，可自行把中文需求翻成英文提示詞）、size、quality、purpose。回 url 後可 upsert_product 設 coverUrl，或放進 upsert_content 的 design image 區塊。',
};

const SYSTEM_PROMPT = `你是「AIGC創客架站套件」的後台全站工作總控（AI 指令台）。使用者是網站管理員，用中文下指令；你透過工具操作網站：前端頁面、電商訂單／物流／發票／折扣碼／庫存、報表分析、商品製圖、商品上架與分類、線上課程上架、Banner 設計。
原則：
1. 先用唯讀工具查清楚（列商品、看訂單、讀草稿…），再規劃寫入動作。唯讀工具會立即執行並把結果給你。
2. 所有會改動資料的工具（寫入）不會立刻執行：系統會把你要做的動作列成「待確認清單」交給使用者按下確認。因此你可以在同一回合排入多個寫入動作；請在回覆中用一兩句話說明將做什麼、為什麼。
3. 頁面一律走草稿流程：upsert_content 只存草稿 → preview_content 取預覽連結給使用者 → 使用者說要上線才 publish_content（confirm=true）。不要在使用者未要求時發佈。
4. 產圖會花錢：一次一張，先確認尺寸與用途。Banner 一般 1536x1024；商品主圖 1024x1024。
5. 不要杜撰資料；找不到就說找不到。金額一律整數新台幣。
6. 回覆精簡、條列，用繁體中文；回覆給使用者的連結請完整輸出。`;

/**
 * AI 指令台：自然語言 → OPS 動作。
 * - 供應商：anthropic（Messages API tool use）／openai（chat.completions tools）／mock（本機規則，測試用）。
 * - 唯讀動作即時執行；寫入動作先變成 pending，前端按「確認執行」帶 HMAC token 回來才跑（與頁面草稿／發佈確認同一套防呆哲學）。
 * - 系統功能（部署、遷移、設定、管理員…）不開放給指令台。
 */
@Injectable()
export class CommandService {
  private readonly log = new Logger('Command');
  constructor(
    private readonly ops: OpsService,
    private readonly settings: SettingsService,
  ) {}

  async config() {
    const [prov, model, anthropicKey, openaiKey] = await Promise.all([
      this.settings.get(SETTING_KEYS.aiCommandProvider, 'AI_COMMAND_PROVIDER'),
      this.settings.get(SETTING_KEYS.aiCommandModel, 'AI_COMMAND_MODEL'),
      this.settings.get(SETTING_KEYS.anthropicApiKey, 'ANTHROPIC_API_KEY'),
      this.settings.get(SETTING_KEYS.openaiApiKey, 'OPENAI_API_KEY'),
    ]);
    const provider = (prov || (anthropicKey ? 'anthropic' : openaiKey ? 'openai' : 'mock')) as 'mock' | 'anthropic' | 'openai';
    const key = provider === 'anthropic' ? anthropicKey : provider === 'openai' ? openaiKey : '';
    return { provider, model: model || (provider === 'anthropic' ? 'claude-sonnet-5' : provider === 'openai' ? 'gpt-4.1' : 'rules'), ready: provider === 'mock' || !!key, key, anthropicConfigured: !!anthropicKey, openaiConfigured: !!openaiKey, tasks: COMMAND_TASKS, actions: this.actions().map((a) => ({ action: a, desc: OPS_ACTIONS[a].desc, mutating: OPS_ACTIONS[a].mutating })) };
  }

  actions(): OpsAction[] {
    return OPS_ACTION_KEYS.filter((a) => !COMMAND_EXCLUDED_ACTIONS.includes(a));
  }
  private tools() {
    return this.actions().map((a) => ({ name: a, description: `${OPS_ACTIONS[a].desc}${OPS_ACTIONS[a].mutating ? '（寫入：需使用者確認）' : '（唯讀：立即執行）'}${TOOL_HINTS[a] ? ' ' + TOOL_HINTS[a] : ''}`, input_schema: { type: 'object', properties: {}, additionalProperties: true } as Record<string, unknown> }));
  }

  /* ---------- 主流程 ---------- */
  async run(input: { message: string; history?: ChatTurn[] }, actor: string): Promise<CommandResult> {
    const message = String(input.message ?? '').trim();
    if (!message) throw new BadRequestException('message is required');
    const history = (input.history ?? []).slice(-20).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', text: String(h.text ?? '').slice(0, 8000) })) as ChatTurn[];
    const cfg = await this.config();
    if (!cfg.ready) throw new BadRequestException(`AI 指令台尚未設定金鑰（供應商 ${cfg.provider}）；請到指令台「設定」填入，或改用 mock 測試`);
    const executed: CommandResult['executed'] = [];
    const pending: PendingStep[] = [];
    const exec = async (name: string, params: Record<string, unknown>) => {
      if (!this.actions().includes(name as OpsAction)) return { ok: false, error: `不允許的動作：${name}` };
      if (OPS_ACTIONS[name as OpsAction].mutating) {
        pending.push({ action: name as OpsAction, params, desc: OPS_ACTIONS[name as OpsAction].desc });
        return { ok: true, staged: true, note: '已列入待確認清單，使用者確認後才會執行；請繼續規劃或作結。' };
      }
      const r = await this.ops.run(name, params, actor);
      executed.push({ action: name, params, ok: r.ok, data: r.data, error: r.error });
      return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error };
    };
    let reply = '';
    if (cfg.provider === 'mock') reply = await this.mock(message, exec);
    else if (cfg.provider === 'anthropic') reply = await this.anthropic(cfg, history, message, exec);
    else reply = await this.openai(cfg, history, message, exec);
    const token = pending.length ? this.sign(pending, actor) : undefined;
    return { reply: reply || (pending.length ? '我準備執行以下動作，請確認。' : '（沒有回覆）'), executed, pending, token, provider: cfg.provider, model: cfg.model };
  }

  /* ---------- 確認執行 ---------- */
  private sign(pending: PendingStep[], actor: string, exp = Date.now() + 30 * 60_000) {
    const payload = Buffer.from(JSON.stringify({ pending, actor, exp })).toString('base64url');
    const sig = createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }
  async confirm(token: string, actor: string) {
    const [payload, sig] = String(token ?? '').split('.');
    if (!payload || !sig) throw new BadRequestException('token 無效');
    const want = Buffer.from(createHmac('sha256', env.SESSION_SECRET).update(payload).digest('base64url'));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) throw new BadRequestException('token 驗章失敗');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { pending: PendingStep[]; actor: string; exp: number };
    if (data.exp < Date.now()) throw new BadRequestException('確認已過期（30 分鐘），請重新下指令');
    if (data.actor !== actor) throw new BadRequestException('只能由下指令的管理員確認');
    const results: { action: string; params: Record<string, unknown>; ok: boolean; data?: unknown; error?: string }[] = [];
    for (const step of data.pending) {
      if (!this.actions().includes(step.action)) {
        results.push({ action: step.action, params: step.params, ok: false, error: '不允許的動作' });
        continue;
      }
      const r = await this.ops.run(step.action, step.params, actor);
      results.push({ action: step.action, params: step.params, ok: r.ok, data: r.data, error: r.error });
      if (!r.ok) break; // 後續動作可能依賴前一步，失敗即停
    }
    return { results, summary: this.summarize(results) };
  }
  private summarize(results: { action: string; ok: boolean; data?: unknown; error?: string }[]) {
    return results
      .map((r) => {
        if (!r.ok) return `✗ ${r.action}：${r.error}`;
        const d = r.data as Record<string, unknown> | undefined;
        const preview = typeof d?.preview === 'string' ? d.preview : d?.preview && typeof d.preview === 'object' ? (d.preview as { url?: string }).url : undefined;
        const hint = d?.url ? ` → ${String(d.url)}` : preview ? ` → 沙盒預覽 ${preview}` : d?.slug ? `（${String(d.slug)}）` : d?.sku ? `（${String(d.sku)}）` : '';
        return `✓ ${r.action}${hint}`;
      })
      .join('\n');
  }

  /* ---------- Anthropic Messages API ---------- */
  private async anthropic(cfg: { key: string; model: string }, history: ChatTurn[], message: string, exec: (n: string, p: Record<string, unknown>) => Promise<unknown>) {
    type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } | { type: 'tool_result'; tool_use_id: string; content: string };
    const messages: { role: 'user' | 'assistant'; content: string | Block[] }[] = [...history.map((h) => ({ role: h.role, content: h.text })), { role: 'user', content: message }];
    let reply = '';
    for (let step = 0; step < 8; step++) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, max_tokens: 4096, system: SYSTEM_PROMPT, tools: this.tools(), messages }),
        signal: AbortSignal.timeout(120_000),
      });
      const j = (await res.json()) as { content?: Block[]; stop_reason?: string; error?: { message?: string } };
      if (!res.ok) throw new BadRequestException(`Anthropic ${res.status}：${j.error?.message ?? 'request failed'}`);
      const content = j.content ?? [];
      reply = content.filter((b): b is { type: 'text'; text: string } => b.type === 'text').map((b) => b.text).join('\n').trim() || reply;
      const uses = content.filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use');
      if (!uses.length) break;
      messages.push({ role: 'assistant', content });
      const results: Block[] = [];
      for (const u of uses) results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(await exec(u.name, u.input ?? {})).slice(0, 60_000) });
      messages.push({ role: 'user', content: results });
    }
    return reply;
  }

  /* ---------- OpenAI chat.completions ---------- */
  private async openai(cfg: { key: string; model: string }, history: ChatTurn[], message: string, exec: (n: string, p: Record<string, unknown>) => Promise<unknown>) {
    type Msg = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]; tool_call_id?: string };
    const messages: Msg[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history.map((h) => ({ role: h.role, content: h.text }) as Msg), { role: 'user', content: message }];
    const tools = this.tools().map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    let reply = '';
    for (let step = 0; step < 8; step++) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: cfg.model, messages, tools, tool_choice: 'auto' }), signal: AbortSignal.timeout(120_000) });
      const j = (await res.json()) as { choices?: { message: Msg }[]; error?: { message?: string } };
      if (!res.ok) throw new BadRequestException(`OpenAI ${res.status}：${j.error?.message ?? 'request failed'}`);
      const m = j.choices?.[0]?.message;
      if (!m) break;
      if (m.content) reply = m.content.trim();
      if (!m.tool_calls?.length) break;
      messages.push(m);
      for (const c of m.tool_calls) {
        let params: Record<string, unknown> = {};
        try {
          params = JSON.parse(c.function.arguments || '{}');
        } catch {
          params = {};
        }
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(await exec(c.function.name, params)).slice(0, 60_000) });
      }
    }
    return reply;
  }

  /* ---------- mock：本機規則（測試／示範） ---------- */
  private async mock(message: string, exec: (n: string, p: Record<string, unknown>) => Promise<unknown>) {
    const m = message;
    const grab = (re: RegExp) => m.match(re)?.[1]?.trim();
    if (/(列出|查看|看看|有哪些).*(商品)|商品(清單|列表)/.test(m)) {
      const category = grab(/分類[是為]?[「"']?([^\s」"'的，,、]+)/);
      const r = (await exec('list_products', { ...(category ? { category } : {}), limit: 50 })) as { data?: unknown[] };
      return `（mock）已列出商品${category ? `（分類 ${category}）` : ''}，共 ${Array.isArray(r.data) ? r.data.length : 0} 筆，見下方結果。`;
    }
    if (/(上架|新增|建立).*(商品)/.test(m)) {
      const sku = grab(/SKU[:：\s]*([A-Za-z0-9_-]+)/i);
      const name = grab(/名稱[:：\s]*[「"']?([^「」"'，,、\n]+)/);
      const price = grab(/價格[:：\s]*(\d+)/);
      const category = grab(/分類[:：\s]*[「"']?([^「」"'，,、\n\s]+)/);
      const stock = grab(/庫存[:：\s]*(\d+)/);
      if (!sku || !name || !price) return '（mock）請提供 SKU、名稱、價格（例：上架商品：SKU AI-TEE、名稱「AI 創客 T 恤」、價格 590、分類 服飾、庫存 50）。';
      await exec('upsert_product', { sku, name, price: Number(price), type: 'physical', isActive: true, ...(category ? { category } : {}), ...(stock ? { stock: Number(stock) } : {}) });
      return `（mock）準備上架商品 ${sku}「${name}」NT$ ${price}${category ? `，分類 ${category}` : ''}${stock ? `，庫存 ${stock}` : ''}。請確認執行。`;
    }
    if (/下架/.test(m) && /商品|分類/.test(m)) {
      const category = grab(/分類[是為]?[「"']?([^\s」"'的，,、]+)/);
      const r = (await exec('list_products', { ...(category ? { category } : {}), isActive: true })) as { data?: { sku: string; name: string }[] };
      for (const p of r.data ?? []) await exec('upsert_product', { sku: p.sku, isActive: false });
      return `（mock）將把 ${r.data?.length ?? 0} 件商品下架${category ? `（分類 ${category}）` : ''}。請確認執行。`;
    }
    if (/(banner|橫幅|製圖|商品圖|主圖|產生.*圖|畫一張)/i.test(m)) {
      const banner = /banner|橫幅/i.test(m);
      const size = grab(/(\d{3,4}x\d{3,4})/) ?? (banner ? '1536x1024' : '1024x1024');
      const sku = grab(/SKU[:：\s]*([A-Za-z0-9_-]+)/i);
      await exec('generate_image', { prompt: m, size, quality: 'standard', purpose: banner ? 'banner' : sku ? 'product' : 'illustration' });
      return `（mock）準備產生一張 ${size} 的${banner ? ' Banner' : sku ? `商品圖（${sku}）` : '圖片'}；確認後回傳圖片網址${sku ? '，再用 upsert_product 設為封面' : banner ? '，再放進頁面 Hero 區塊' : ''}。`;
    }
    if (/訂單/.test(m)) {
      const status = /已付款|paid/.test(m) ? 'paid' : /未付款|pending/.test(m) ? 'pending' : undefined;
      const shipping = /未出貨/.test(m) ? 'pending' : /已出貨/.test(m) ? 'shipped' : undefined;
      const today = new Date().toISOString().slice(0, 10);
      const r = (await exec('list_orders', { ...(status ? { status } : {}), ...(shipping ? { shipping } : {}), ...(/今天|今日/.test(m) ? { from: today, to: today } : {}), limit: 50 })) as { data?: unknown[] };
      return `（mock）已列出訂單，共 ${Array.isArray(r.data) ? r.data.length : 0} 筆。`;
    }
    if (/報表|營收|銷售/.test(m)) {
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      await exec('sales_report', { from, to: now.toISOString().slice(0, 10), groupBy: 'day' });
      return '（mock）已取得本月銷售報表（按天）。';
    }
    if (/(建立|新增|上架).*(課程)/.test(m)) {
      const slug = grab(/slug[:：\s]*([a-z0-9-]+)/i);
      const name = grab(/[「"']([^「」"']+)[」"']/);
      const price = grab(/價格[:：\s]*(\d+)/);
      if (!slug || !name || !price) return '（mock）請提供 slug、課程名稱（用「」包住）、價格。';
      await exec('upsert_course', { slug, name, price: Number(price), isPublished: /發布|上線/.test(m) && !/不發布|先不/.test(m), summary: grab(/摘要[:：\s]*([^\n，,]+)/) });
      for (const t of (grab(/章節[:：\s]*([^\n]+)/) ?? '').split(/[、,，]/).map((s) => s.trim()).filter(Boolean)) await exec('add_chapter', { courseSlug: slug, title: t });
      return `（mock）準備建立課程 ${slug}「${name}」NT$ ${price}。請確認執行。`;
    }
    if (/(建立|新增|做).*(頁面|頁)/.test(m) || /(改|修改).*(標題|頁)/.test(m)) {
      const slug = grab(/slug[:：\s]*([a-z0-9-]+)/i) ?? grab(/([a-z0-9-]+) 頁/i) ?? 'about';
      const title = grab(/[「"']([^「」"']+)[」"']/) ?? '新頁面';
      await exec('upsert_content', { slug, type: 'page', title, design: { root: { type: 'root', children: [{ type: 'section', props: { contentWidth: '900px' }, style: { base: { padding: '64px 24px', textAlign: 'center' } }, children: [{ type: 'heading', props: { level: 1, text: title } }, { type: 'text', props: { text: m.slice(0, 200) } }] }] } } });
      return `（mock）準備把頁面「${title}」（/p/${slug}）存成草稿；確認後我會給你沙盒預覽連結（用 preview_content）。`;
    }
    if (/(部署|遷移|管理員|設定|deploy|migrate)/.test(m)) return '系統功能（部署／遷移／設定／管理員）不開放給 AI 指令台，請到「系統功能」選單人工操作。';
    return '（mock 規則模式）我目前只懂：列出商品／上架商品／下架商品／產圖 Banner／訂單／報表／建立課程／建立頁面。要用真正的 AI 理解自然語言，請到「設定」把供應商改成 anthropic 或 openai 並填入金鑰。';
  }
}

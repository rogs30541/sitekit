import { BadRequestException, Injectable, Logger } from '../../compat';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { COMMAND_EXCLUDED_ACTIONS, COMMAND_TASKS, OPS_ACTIONS, OPS_ACTION_KEYS, SETTING_KEYS, type OpsAction } from '@sitekit/shared';
import { env } from '../../env';
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
  generate_image: '參數：prompt（英文描述效果較好）或 templateKey＋inputs（先用 list_image_templates 挑模板，inputs 的 key 依模板 inputFields；商品製圖／Banner 優先套模板）、referenceImages（商品現有 coverUrl 等公開圖網址，≤4）、size、quality、purpose。回 url 後可 upsert_product 設 coverUrl，或放進 upsert_content 的 design image 區塊。',
  set_tracking: '參數：ga4、gtm、fbPixel、tiktok、lineTag、googleAdsId、googleAdsLabel、head、bodyTop、bodyBottom、events{pageView,viewContent,addToCart,initiateCheckout,purchase}（未給的欄位會被清空，先 get_tracking 取現值再整份回傳）。頁面層級追蹤放在 upsert_content 的 design.settings.tracking 或 upsert_sales_page 的 doc.tracking。',
  upsert_sales_page: '參數：slug(必填)、title、code、doc（深度合併）。doc.content 為設計文件（同 upsert_content 的 design 格式，可放 addtocart 區塊）；doc.items=[{productId,kind:offer|bundle|product|addon,order}]（productId 先用 list_products 查）；doc.notice/countdown/theme/display/form/contact/tracking/seo/schedule。存草稿後用 preview_sales_page 給預覽連結。',
  publish_sales_page: '參數：idOrSlug、confirm(true)、note；unpublish=true 為下架。',
  list_image_templates: '無參數。回每個模板的 key／分類／說明／欄位定義（inputFields[].key、label、required、options）。',
};

const SYSTEM_PROMPT = `你是「SiteKit 架站套件」的後台全站工作總控（AI 指令台）。使用者是網站管理員，用中文下指令；你透過工具操作網站：前端頁面、電商訂單／物流／發票／折扣碼／庫存、報表分析、商品製圖、商品上架與分類、線上課程上架、Banner 設計。
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
    const [prov, model, anthropicKey, openaiKey, geminiKey] = await Promise.all([
      this.settings.get(SETTING_KEYS.aiCommandProvider, 'AI_COMMAND_PROVIDER'),
      this.settings.get(SETTING_KEYS.aiCommandModel, 'AI_COMMAND_MODEL'),
      this.settings.get(SETTING_KEYS.anthropicApiKey, 'ANTHROPIC_API_KEY'),
      this.settings.get(SETTING_KEYS.openaiApiKey, 'OPENAI_API_KEY'),
      this.settings.get(SETTING_KEYS.geminiApiKey, 'GEMINI_API_KEY'),
    ]);
    const provider = (prov || (anthropicKey ? 'anthropic' : openaiKey ? 'openai' : geminiKey ? 'gemini' : 'mock')) as 'mock' | 'anthropic' | 'openai' | 'gemini';
    const key = provider === 'anthropic' ? anthropicKey : provider === 'openai' ? openaiKey : provider === 'gemini' ? geminiKey : '';
    return { provider, model: model || (provider === 'anthropic' ? 'claude-sonnet-5' : provider === 'openai' ? 'gpt-4.1' : provider === 'gemini' ? 'gemini-2.5-pro' : 'rules'), ready: provider === 'mock' || !!key, key, anthropicConfigured: !!anthropicKey, openaiConfigured: !!openaiKey, geminiConfigured: !!geminiKey, tasks: COMMAND_TASKS, actions: this.actions().map((a) => ({ action: a, desc: OPS_ACTIONS[a].desc, mutating: OPS_ACTIONS[a].mutating })) };
  }

  /** 自動偵測供應商可用模型（用已存或傳入的金鑰；OpenAI 只列聊天／推理模型） */
  async listModels(provider: string, apiKey?: string): Promise<{ provider: string; models: { id: string; label: string }[]; default: string; error?: string }> {
    const key = apiKey?.trim() || (provider === 'anthropic' ? await this.settings.get(SETTING_KEYS.anthropicApiKey, 'ANTHROPIC_API_KEY') : provider === 'openai' ? await this.settings.get(SETTING_KEYS.openaiApiKey, 'OPENAI_API_KEY') : provider === 'gemini' ? await this.settings.get(SETTING_KEYS.geminiApiKey, 'GEMINI_API_KEY') : '');
    if (provider === 'mock') return { provider, models: [{ id: 'rules', label: '規則模式（不呼叫模型）' }], default: 'rules' };
    const fallback = provider === 'anthropic' ? 'claude-sonnet-5' : provider === 'gemini' ? 'gemini-2.5-pro' : 'gpt-4.1';
    if (!key) return { provider, models: [], default: fallback, error: '尚未設定金鑰' };
    try {
      if (provider === 'gemini') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(15_000) });
        const j = (await res.json()) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[]; error?: { message?: string } };
        if (!res.ok) return { provider, models: [], default: fallback, error: `Gemini ${res.status}：${j.error?.message ?? ''}` };
        const models = (j.models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent') && /gemini/i.test(m.name) && !/image|embedding|tts|audio|live/i.test(m.name)).map((m) => ({ id: m.name.replace(/^models\//, ''), label: m.displayName ? `${m.displayName}（${m.name.replace(/^models\//, '')}）` : m.name.replace(/^models\//, '') }));
        return { provider, models, default: models.find((m) => /2\.5-pro/.test(m.id))?.id ?? models[0]?.id ?? fallback };
      }
      if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(15_000) });
        const j = (await res.json()) as { data?: { id: string; display_name?: string; created_at?: string }[]; error?: { message?: string } };
        if (!res.ok) return { provider, models: [], default: fallback, error: `Anthropic ${res.status}：${j.error?.message ?? ''}` };
        const models = (j.data ?? []).sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))).map((m) => ({ id: m.id, label: m.display_name ? `${m.display_name}（${m.id}）` : m.id }));
        return { provider, models, default: models.find((m) => /sonnet/.test(m.id))?.id ?? models[0]?.id ?? fallback };
      }
      const res = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
      const j = (await res.json()) as { data?: { id: string; created?: number }[]; error?: { message?: string } };
      if (!res.ok) return { provider, models: [], default: fallback, error: `OpenAI ${res.status}：${j.error?.message ?? ''}` };
      const models = (j.data ?? [])
        .filter((m) => /^(gpt-|o\d|chatgpt-)/.test(m.id) && !/(audio|realtime|tts|transcribe|search|image|embedding|moderation|instruct|-\d{4}-\d{2}-\d{2}$)/.test(m.id))
        .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
        .map((m) => ({ id: m.id, label: m.id }));
      return { provider, models, default: models.find((m) => m.id === 'gpt-4.1')?.id ?? models[0]?.id ?? fallback };
    } catch (e) {
      return { provider, models: [], default: fallback, error: e instanceof Error ? e.message : String(e) };
    }
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
    else if (cfg.provider === 'gemini') reply = await this.gemini(cfg, history, message, exec);
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

  /* ---------- Gemini generateContent（function calling） ---------- */
  private async gemini(cfg: { key: string; model: string }, history: ChatTurn[], message: string, exec: (n: string, p: Record<string, unknown>) => Promise<unknown>) {
    type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } };
    const contents: { role: 'user' | 'model'; parts: Part[] }[] = [...history.map((h) => ({ role: (h.role === 'assistant' ? 'model' : 'user') as 'user' | 'model', parts: [{ text: h.text }] })), { role: 'user', parts: [{ text: message }] }];
    const tools = [{ functionDeclarations: this.tools().map((t) => ({ name: t.name, description: t.description.slice(0, 1000), parameters: { type: 'OBJECT', properties: { params_json: { type: 'STRING', description: '參數以 JSON 字串傳入（依工具說明的參數名）' } } } })) }];
    let reply = '';
    for (let step = 0; step < 8; step++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.key)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT + '\n工具參數請放在 params_json（JSON 字串）。' }] }, contents, tools }), signal: AbortSignal.timeout(120_000) });
      const j = (await res.json()) as { candidates?: { content?: { parts?: Part[] } }[]; error?: { message?: string } };
      if (!res.ok) throw new BadRequestException(`Gemini ${res.status}：${j.error?.message ?? 'request failed'}`);
      const parts = j.candidates?.[0]?.content?.parts ?? [];
      reply = parts.filter((p) => p.text).map((p) => p.text).join('\n').trim() || reply;
      const calls = parts.filter((p) => p.functionCall);
      if (!calls.length) break;
      contents.push({ role: 'model', parts });
      const responses: Part[] = [];
      for (const c of calls) {
        let params: Record<string, unknown> = {};
        const raw = c.functionCall!.args?.params_json;
        try {
          params = typeof raw === 'string' ? JSON.parse(raw) : ((c.functionCall!.args as Record<string, unknown>) ?? {});
        } catch {
          params = {};
        }
        const r = await exec(c.functionCall!.name, params);
        responses.push({ functionResponse: { name: c.functionCall!.name, response: { result: JSON.stringify(r).slice(0, 60_000) } } });
      }
      contents.push({ role: 'user', parts: responses });
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

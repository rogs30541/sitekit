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
  upsert_content: '參數：slug(必填)、type page|post、title、body(HTML) 或 design、excerpt、coverUrl。design 優先用區塊頁：{"kind":"sections","sections":[…]}（sections 格式同 set_home_sections，20 種 kind）；或視覺設計器 DesignDoc 格式：{"root":{"type":"root","children":[{"type":"section","props":{"contentWidth":"1100px"},"style":{"base":{"padding":"64px 24px","background":"#111827","color":"#fff","textAlign":"center"}},"children":[{"type":"heading","props":{"level":1,"text":"標題"}},{"type":"text","props":{"text":"副標"}},{"type":"image","props":{"src":"https://…","alt":"…"}},{"type":"button","props":{"text":"按鈕","href":"/store","variant":"primary"}}]}]}}；可用類型 section/container/columns(props.cols)/column/heading/text/richtext(props.html)/button/spacer/divider/image/video/embed(props.url)/quote/list(props.items[])/iconbox(icon,title,text)/card(image,title,text,buttonText,href)/faq(items[{q,a}])/html/products/courses/posts(props.limit,title)。style 可有 base/tablet/mobile 三組 CSS（camelCase）。首頁 slug=home。',
  publish_content: '參數：idOrSlug、confirm(true)、note。只有使用者在指令台確認後才會執行。',
  preview_content: '參數：idOrSlug。回沙盒預覽網址，請把網址給使用者。',
  get_content_draft: '參數：idOrSlug。',
  restore_revision: '參數：idOrSlug、version。',
  import_page_design: '參數：slug、title、type、design。',
  export_page_design: '參數：idOrSlug。',
  set_home_sections: '參數：sections[]（20 種 kind，整份覆寫；先 get_site 取現值）。每個區塊可帶 variant、tone default|muted|accent|dark|image（＋bgImageUrl）、compact、id（錨點）。kind 與欄位：hero{variant center|left|split|cover|editorial|dashboard|carousel,kicker,title,subtitle,ctaText,ctaHref,cta2Text,cta2Href,imageUrl,videoUrl,imageSide,highlights[{icon,title,text}],slides[{title,subtitle,imageUrl,ctaText,ctaHref}]}；banner{text,href}；stats{items[{value,label,note}]}；features{variant grid|list|icons|tabs|numbered,columns 1-4,items[{icon,code,tag,title,text,href,ctaText}]}；split{title,text,bullets[],imageUrl,videoUrl,imageSide,sticky,ctaText,ctaHref}；gallery{variant grid|masonry|strip|logos,columns 2-6,items[{imageUrl,caption,href}]}；testimonials{variant cards|quotes|wall|single,items[{quote,name,role,avatarUrl,metric}]}；faq{items[{q,a}]}；pricing{plans[{name,price,period,note,features[],ctaText,ctaHref,highlight}]}；steps{variant numbers|timeline|cards,items[{title,text}]}；team{variant grid|list|founder,members[{name,role,bio,avatarUrl}]}；logos{items[{name,imageUrl}]}；video{videoUrl,text}；cta{variant band|card|split,title,text,buttonText,buttonHref}；contact{variant cards|columns|map,mapEmbedUrl,showForm,items[{icon,label,value,href}]}；categories{variant tiles|chips|icons,columns,items[{icon,title,href,count,imageUrl}]}；courses|products|posts{title,subtitle,limit,columns,variant,ctaText,ctaHref}（自動讀資料）；html{title,html}。icon 填圖示名稱。首頁若有 slug=home 的已發佈設計頁會優先於 sections。',
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
  list_sales_templates: '參數：category（可選）。回 templates[{id,name,category,style,palette,blocks[]}]；做銷售頁先從這裡挑一套。',
  apply_sales_template: '參數：id（先 list_sales_templates）、title（新頁必填）、slug（可選；已存在會覆寫內文與主題）、confirm(true)。只建立草稿；之後用 upsert_sales_page 掛商品（items）與改文案、preview_sales_page 給預覽、使用者要上線才 publish_sales_page。',
  upsert_sales_page: '參數：slug(必填)、title、code、doc（深度合併）。doc.content 為設計文件（同 upsert_content 的 design 格式，可放 addtocart 區塊）；doc.items=[{productId,kind:offer|bundle|product|addon,order}]（productId 先用 list_products 查）；doc.notice/countdown/theme/display/form/contact/tracking/seo/schedule。存草稿後用 preview_sales_page 給預覽連結。',
  publish_sales_page: '參數：idOrSlug、confirm(true)、note；unpublish=true 為下架。',
  apply_site_template: '參數：id（先 list_site_templates 取 id）、confirm(true)、restore(true=還原套版前)、pages(false=不建子頁)、menu(false=不動選單)。會覆寫主題／首頁區塊／選單並建立同名子頁；商品／課程／文章／品牌資料不動；第一次套版前自動備份。',
  list_site_templates: '參數：category image|shop|course|brand|service（可選）。回 templates[{id,name,category,style,tagline,tags,theme,pages[],homeKinds[],headerMenu[]}] 與 current（目前版型）。',
  recommend_site_template: '參數：industry（行業描述，例：手工烘焙坊）、style（風格詞：簡潔／深色／溫暖…）、category（可選）、keywords[]。回 picked／alternatives；推薦後把理由講給使用者。',
  quick_setup_site: '參數：confirm(true)、templateId（或 industry／category／style 讓系統挑）、brandName、siteName、tagline、description、contactEmail、phone、address、accent(#rrggbb)、mode。只寫使用者給的值。回 template／pages／brandUpdated／next。',
  set_theme: '參數（只放要改的）：mode、accent、accent2、font、radius、header、footer、container、heading。accent 會同步 brand.primaryColor。',
  update_brand: '參數：settings{ key: value }，key 白名單 brand.name／brand.siteName／brand.description／brand.tagline／brand.logoUrl／brand.primaryColor／brand.contactEmail／brand.phone／brand.address／brand.social.facebook|instagram|line|youtube／brand.footerText／seo.ogImage／site.locale。',
  list_contact_messages: '參數：status new|read|replied|archived（可選）、limit。回 counts 與 items[{id,name,email,phone,subject,message,page,status,note,createdAt}]。',
  update_contact_message: '參數：id、status new|read|replied|archived、note。',
  get_site: '無參數。回 brand、theme、menus{header,footer}、home.sections（現有首頁區塊，改動前先讀）、settings。',
  list_image_templates: '無參數。回每個模板的 key／分類／說明／欄位定義（inputFields[].key、label、required、options）。',
};

const SYSTEM_PROMPT = `你是「SiteKit 架站套件」的後台全站工作總控（AI 指令台）。使用者是網站管理員，用中文下指令；你透過工具操作整站：
建站（版型與主題、選單）／內容（首頁區塊、頁面與文章、一頁式銷售頁）／商務（商品庫存、課程學員、訂單物流發票）／營運（報表名單、客服訊息、追蹤與 SEO）／設計（商品製圖與 Banner）。
原則：
1. 先用唯讀工具查清楚現況（get_site、list_*、get_*），再規劃寫入。唯讀工具會立即執行並把結果給你。
2. 所有寫入工具不會立刻執行：系統會把你要做的動作列成「待確認清單」交給使用者按確認。同一回合可排多個寫入；回覆要用一兩句話說明「要做什麼、會覆寫什麼、怎麼還原」。
3. 頁面／區塊頁／銷售頁一律草稿流程：upsert_content 或 upsert_sales_page 只存草稿 → preview_* 取預覽連結給使用者 → 使用者說要上線才 publish_*（confirm=true）。不要在使用者未要求時發佈。
4. 新頁面優先用「區塊頁」：upsert_content 的 design 傳 { kind:'sections', sections:[…] }（與首頁 set_home_sections 同一套 20 種區塊，後台可用區塊編輯器續改）；只有需要自由排版才用視覺設計器 DesignDoc。文章（type post）用 body HTML。
5. 首頁區塊、選單、追蹤碼都是「整份覆寫」：先讀現值（get_site／get_menu／get_tracking），在原資料上增刪改後整份回傳，不要只送差異。
6. 套版 apply_site_template 會覆寫主題、首頁區塊、選單並建立同名子頁（商品／課程／文章／品牌資料不動），可用 restore=true 還原；請先 list_site_templates 比較再挑一套，並在回覆說明影響。
7. 主題用 set_theme（只改給的鍵）；品牌名稱／聯絡／SEO／語言用 update_brand（白名單）。金流、金鑰、部署、遷移、管理員屬系統功能，不在你的工具裡，遇到就請使用者到「系統功能」選單操作。
8. 區塊裡的 icon 一律填圖示名稱（例 mail、phone、star、rocket、check-circle、shield、truck、sprout），不要用 emoji。連結用站內路徑（/courses、/store、/p/about、/#faq）或完整網址。
9. 產圖會花錢：一次一張，先確認尺寸與用途。Banner 一般 1536x1024；商品主圖 1024x1024；商品圖優先用 list_image_templates 挑模板＋參考圖。產完的網址回填商品 coverUrl 或區塊的 imageUrl／bgImageUrl。
10. 聯絡表單訊息（list_contact_messages）只做摘要、排序與擬回覆文字；真正寄信由管理員在後台「表單訊息」用 Email 回覆；標記狀態用 update_contact_message。回覆學員提問 answer_question 會寄信給學員，務必列成待確認。
11. 一鍵建站：使用者說「幫我建站／從零開始」時，先問齊或從對話取得品牌名稱、行業、風格偏好、聯絡 Email／電話（沒有就只用有的），用 recommend_site_template 挑版型並說明理由與備選，再排入 quick_setup_site（confirm=true）；文案與圖片之後再用「首頁區塊」與「製圖」項目補，不要自己編造品牌事實。
12. 不要杜撰資料；找不到就說找不到。金額一律整數新台幣。回覆精簡、條列，用繁體中文；連結請完整輸出。`;

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
    if (/(一鍵建站|幫我建站|從零開始|建一個網站|開站)/.test(m)) {
      const brandName = grab(/品牌(?:名稱)?[:：\s]*[「"']([^「」"']+)[」"']/) ?? grab(/[「"']([^「」"']+)[」"']/);
      const industry = grab(/行業[:：\s]*([^\s，,、]+)/) ?? grab(/是一?[家間個]?([^\s，,、]{2,8})(?:的)?(?:網站|店|公司)/);
      const style = grab(/風格[:：\s]*([^\s，,、]+)/);
      const contactEmail = grab(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
      const phone = grab(/電話[:：\s]*([\d\-+ ]{7,})/);
      if (!brandName || !industry) return '（mock）請告訴我品牌名稱（用「」包住）與行業（例：行業 烘焙），我才能挑版型並建站。';
      const rec = (await exec('recommend_site_template', { industry, ...(style ? { style } : {}) })) as { data?: { picked?: { id: string; name: string } | null; category?: string } };
      if (!rec.data?.picked) return '（mock）請告訴我品牌名稱（用「」包住）與行業（例：行業 烘焙），我才能挑版型。';
      await exec('quick_setup_site', { confirm: true, templateId: rec.data.picked.id, ...(brandName ? { brandName } : {}), ...(industry ? { industry } : {}), ...(style ? { style } : {}), ...(contactEmail ? { contactEmail } : {}), ...(phone ? { phone } : {}) });
      return `（mock）依「${industry ?? '未指定行業'}」推薦版型「${rec.data.picked.name}」（${rec.data.picked.id}）；確認後會套用並把${[brandName && '品牌名稱', contactEmail && 'Email', phone && '電話'].filter(Boolean).join('、') || '版型'}寫進站台。文案與圖片之後再補。請確認執行。`;
    }
    if (/(版型|套版|套用|範本|template)/i.test(m)) {
      const cat = /電商|商城|賣/.test(m) ? 'shop' : /課程|教學/.test(m) ? 'course' : /品牌|個人/.test(m) ? 'brand' : /服務|顧問|診所|事務所/.test(m) ? 'service' : /形象|企業|公司/.test(m) ? 'image' : undefined;
      const r = (await exec('list_site_templates', { ...(cat ? { category: cat } : {}) })) as { data?: { templates?: { id: string; name: string }[] } };
      const list = r.data?.templates ?? [];
      const wanted = grab(/套用[「"']?([a-z0-9-]+)/i) ?? grab(/id[:：\s]*([a-z0-9-]+)/i);
      const pick = wanted ? list.find((t) => t.id === wanted) : /套用|換成|改用/.test(m) ? list[0] : undefined;
      if (pick) {
        await exec('apply_site_template', { id: pick.id, confirm: true });
        return `（mock）準備套用版型「${pick.name}」（${pick.id}）：會覆寫主題、首頁區塊、選單並建立同名子頁；商品／課程／文章不動，可用 restore 還原。請確認執行。`;
      }
      return `（mock）已列出 ${list.length} 套版型${cat ? `（${cat}）` : ''}，見下方結果；說「套用 <id>」即可排入待確認。`;
    }
    if (/(主題|深色|淺色|字型|圓角|頁首|頁尾)/.test(m) && !/區塊|頁面/.test(m)) {
      const t: Record<string, string> = {};
      if (/深色/.test(m)) t.mode = 'dark';
      if (/淺色/.test(m)) t.mode = 'light';
      if (/圓體/.test(m)) t.font = 'rounded';
      if (/明體|襯線/.test(m)) t.font = 'serif';
      if (/等寬/.test(m)) t.font = 'mono';
      if (/大圓角/.test(m)) t.radius = 'xl';
      if (/直角/.test(m)) t.radius = 'none';
      if (/頁首置中|置中/.test(m)) t.header = 'centered';
      if (/頁尾單列|極簡頁尾/.test(m)) t.footer = 'minimal';
      const color = grab(/(#[0-9a-fA-F]{6})/);
      if (color) t.accent = color;
      if (!Object.keys(t).length) return '（mock）主題可改：深色／淺色、圓體／明體／等寬、大圓角／直角、頁首置中、頁尾單列、主色 #rrggbb。';
      await exec('set_theme', t);
      return `（mock）準備更新主題：${Object.entries(t).map(([k, v]) => `${k}=${v}`).join('、')}。請確認執行。`;
    }
    if (/(網站名稱|品牌名稱|標語|聯絡 ?email|電話|地址)/i.test(m) && /改|設|換/.test(m)) {
      const settings: Record<string, string> = {};
      const siteName = grab(/網站名稱[改設為成]+[「"']([^「」"']+)[」"']/);
      const name = grab(/品牌名稱[改設為成]+[「"']([^「」"']+)[」"']/);
      const tagline = grab(/標語[改設為成]*[「"']([^「」"']+)[」"']/);
      const email = grab(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
      if (siteName) settings['brand.siteName'] = siteName;
      if (name) settings['brand.name'] = name;
      if (tagline) settings['brand.tagline'] = tagline;
      if (email) settings['brand.contactEmail'] = email;
      if (!Object.keys(settings).length) return '（mock）請用「網站名稱改成「…」」「標語「…」」「Email 改成 x@y」的格式。';
      await exec('update_brand', { settings });
      return `（mock）準備更新品牌設定：${Object.keys(settings).join('、')}。請確認執行。`;
    }
    if (/(表單|訊息|留言|聯絡我們)/.test(m) && !/區塊|首頁/.test(m)) {
      const status = /未讀/.test(m) ? 'new' : /已回覆/.test(m) ? 'replied' : /封存/.test(m) ? 'archived' : undefined;
      const r = (await exec('list_contact_messages', { ...(status ? { status } : {}), limit: 50 })) as { data?: { items?: unknown[] } };
      return `（mock）已列出聯絡表單訊息${status ? `（${status}）` : ''}，共 ${r.data?.items?.length ?? 0} 筆，見下方結果。`;
    }
    if (/首頁/.test(m) && /(區塊|加|放|改)/.test(m)) {
      const r = (await exec('get_site', {})) as { data?: { home?: { sections?: Record<string, unknown>[] } } };
      const cur = r.data?.home?.sections ?? [];
      const add: Record<string, unknown> = /見證|評價/.test(m) ? { kind: 'testimonials', title: '學員見證', items: [{ quote: '很實用。', name: '學員 A' }, { quote: '值得推薦。', name: '學員 B' }, { quote: '收穫很多。', name: '學員 C' }] } : /faq|常見問題/i.test(m) ? { kind: 'faq', title: '常見問題', items: [{ q: '如何購買？', a: '到商城結帳即可。' }] } : /cta|行動/i.test(m) ? { kind: 'cta', title: '準備好開始了嗎？', buttonText: '立即加入', buttonHref: '/register' } : { kind: 'features', title: '特色', items: [{ icon: 'sparkles', title: '特色一' }, { icon: 'rocket', title: '特色二' }, { icon: 'lightbulb', title: '特色三' }] };
      await exec('set_home_sections', { sections: [...cur, add] });
      return `（mock）準備在首頁末尾加入「${String(add.kind)}」區塊（目前 ${cur.length} 個 → ${cur.length + 1} 個），整份覆寫。請確認執行。`;
    }
    if (/(銷售頁|一頁式)/.test(m) && /(模板|套版|範本)/.test(m)) {
      const id = grab(/(sales-[a-z]+-[a-z]+)/i);
      const title = grab(/[「"']([^「」"']+)[」"']/);
      if (id) {
        if (!title) return '（mock）請給銷售頁標題（用「」包住），例：用模板 sales-course-neon 建立銷售頁「秋季實體課」。';
        await exec('apply_sales_template', { id, title, confirm: true });
        return `（mock）準備用套版 ${id} 建立銷售頁「${title}」草稿（內文＋主題＋區塊順序；不發佈）。確認後到「一頁式網頁」掛商品與改文案。請確認執行。`;
      }
      const cat = /課程|報名/.test(m) ? 'course' : /商品|電商/.test(m) ? 'shop' : /服務|預約/.test(m) ? 'service' : /品牌|個人/.test(m) ? 'brand' : /方案|形象|企業/.test(m) ? 'image' : undefined;
      const r = (await exec('list_sales_templates', { ...(cat ? { category: cat } : {}) })) as { data?: { templates?: unknown[] } };
      return `（mock）已列出 ${r.data?.templates?.length ?? 0} 套銷售頁模板${cat ? `（${cat}）` : ''}；說「用模板 <id> 建立銷售頁「標題」」即可排入待確認。`;
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
    return '（mock 規則模式）我目前只懂：一鍵建站／版型套用／銷售頁模板／主題／品牌設定／首頁區塊／表單訊息／列出商品／上架商品／下架商品／產圖 Banner／訂單／報表／建立課程／建立頁面。要用真正的 AI 理解自然語言，請到「設定」把供應商改成 anthropic 或 openai 並填入金鑰。';
  }
}

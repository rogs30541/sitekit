#!/usr/bin/env node
/**
 * SiteKit MCP server（MCP 路徑）
 * 讓訂閱制 AI 工具（Claude Desktop / Claude Code 等）透過 stdio 操作 SiteKit 的部署與更新。
 * 全部工具都轉發到 api 的 /api/ops/*，以 Bearer SITEKIT_OPS_TOKEN 驗證；不持有任何 cookie session。
 *
 * 環境變數：
 *   SITEKIT_API_URL    預設 http://localhost:4000
 *   SITEKIT_OPS_TOKEN  必填，與 apps/api 的 OPS_TOKEN 相同
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = (process.env.SITEKIT_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const TOKEN = process.env.SITEKIT_OPS_TOKEN ?? '';

async function ops(action, params = {}) {
  if (!TOKEN) return { ok: false, error: 'SITEKIT_OPS_TOKEN 未設定' };
  const r = await fetch(`${API}/api/ops/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ action, params }),
  });
  const text = await r.text();
  try {
    return { status: r.status, ...JSON.parse(text) };
  } catch {
    return { status: r.status, ok: false, error: text.slice(0, 500) };
  }
}

const asText = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

const server = new McpServer({ name: 'sitekit', version: '0.1.0' });

server.tool('sitekit_status', '讀取 SiteKit 系統狀態（版本、環境、服務健康）', {}, async () => asText(await ops('status')));

server.tool(
  'sitekit_deploy',
  '觸發部署。target 為 web / api / all',
  { target: z.enum(['web', 'api', 'all']).default('all') },
  async ({ target }) => asText(await ops('deploy', { target })),
);

server.tool('sitekit_migrate', '執行資料庫遷移（prisma migrate deploy）', {}, async () => asText(await ops('migrate')));

server.tool('sitekit_get_settings', '讀取系統設定（機密值遮蔽）', {}, async () => asText(await ops('get_settings')));

server.tool(
  'sitekit_update_settings',
  '更新系統設定鍵值。金流：payment.methods（逗號清單，第一個為預設：newebpay,payuni,ecpay,linepay,pchomepay）、各家 <provider>.merchantId/hashKey/hashIv（LINE Pay 用 linepay.channelId/channelSecret；支付連用 pchomepay.appId/appSecret）、<provider>.testMode=true|false；其他：site.url、brand.name、ai.provider、admin.registerAllowlist（後台自助註冊白名單，email 或 @網域逗號清單）、brand.*、seo.*、物流：logistics.provider none|ecpay|newebpay|both（藍新物流沿用 newebpay.* 商店參數、買家須以藍新付款）、logistics.methods（manual,UNIMARTC2C,FAMIC2C,HILIFEC2C,OKMARTC2C,TCAT,ECAN,NWP_UNIMART,NWP_FAMILY,NWP_HILIFE,NWP_OK 逗號清單）、logistics.fees（UNIMARTC2C=60,TCAT=120）、logistics.senderName/senderPhone/senderZip/senderAddress、ecpayLogistics.merchantId/hashKey/hashIv/testMode；發票：invoice.provider none|ezpay|ecpay、invoice.issueTiming paid|manual、ezpay.merchantId/hashKey/hashIv/testMode、ecpayInvoice.merchantId/hashKey/hashIv/testMode、光貿 amego.taxId/appKey、AI 指令台 ai.commandProvider mock|anthropic|openai／ai.commandModel／anthropic.apiKey、google.clientId/clientSecret、line.loginChannelId/loginChannelSecret',
  { settings: z.record(z.string()) },
  async ({ settings }) => asText(await ops('update_settings', { settings })),
);

server.tool(
  'sitekit_import_content',
  '外站內容匯入（wordpress / csv），預設乾跑',
  { source: z.enum(['wordpress', 'csv']), sourceUrl: z.string().optional(), dryRun: z.boolean().default(true), landMedia: z.boolean().default(false).describe('把內文圖片與封面下載到本站儲存並改寫網址') },
  async ({ source, sourceUrl, dryRun, landMedia }) => asText(await ops('import_content', { source, sourceUrl, dryRun, landMedia })),
);

server.tool('sitekit_audit', '讀取最近的維運稽核日誌', { limit: z.number().int().min(1).max(200).default(50) }, async ({ limit }) =>
  asText(await ops('audit', { limit })),
);

server.tool(
  'sitekit_sales_report',
  '銷售報表：期間營收、已付款訂單數、客單價、退款、折扣、運費、各商品銷量、金流分布（以付款時間計）',
  { scope: z.enum(['shop', 'course', 'all']).optional(), from: z.string().optional().describe('YYYY-MM-DD，預設 30 天前'), to: z.string().optional().describe('YYYY-MM-DD，預設今天'), groupBy: z.enum(['day', 'month']).default('day') },
  async (p) => asText(await ops('sales_report', p)),
);

server.tool(
  'sitekit_update_shipping',
  '更新訂單物流狀態（只限已付款且需出貨的訂單）',
  { orderNo: z.string().describe('商店訂單編號 SK…'), status: z.enum(['pending', 'shipped', 'delivered', 'returned']), carrier: z.string().optional(), trackingNo: z.string().optional() },
  async (p) => asText(await ops('update_shipping', p)),
);

server.tool(
  'sitekit_manage_coupon',
  '折扣碼：建立（op=create）、修改（op=update）、停用（op=disable）',
  { scope: z.enum(['shop', 'course', 'all']).optional(),
    op: z.enum(['create', 'update', 'disable']).default('create'),
    code: z.string().describe('代碼，會轉大寫'),
    type: z.enum(['percent', 'fixed']).optional(),
    value: z.number().int().optional().describe('percent＝百分比 1-100；fixed＝折抵元'),
    minAmount: z.number().int().optional(),
    maxUses: z.number().int().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
    note: z.string().optional(),
  },
  async (p) => asText(await ops('manage_coupon', p)),
);

server.tool(
  'sitekit_adjust_stock',
  '調整商品庫存：set 絕對值（null＝不追蹤）或 delta 增減',
  { sku: z.string().optional(), productId: z.string().optional(), set: z.number().int().nullable().optional(), delta: z.number().int().optional() },
  async (p) => asText(await ops('adjust_stock', p)),
);

server.tool('sitekit_expire_orders', '取消逾期未付款訂單並回補庫存', { hours: z.number().int().min(1).optional() }, async (p) => asText(await ops('expire_orders', p)));

server.tool(
  'sitekit_import_products',
  '商品 CSV 匯入（簡式 sku,name,price,type,description,cover_url,stock,active 或 Shopify 商品匯出檔）；以 sku 冪等 upsert，預設乾跑',
  { csv: z.string().optional(), filePath: z.string().optional(), dryRun: z.boolean().default(true), updateStock: z.boolean().default(false).describe('既有商品是否覆寫庫存') },
  async (p) => asText(await ops('import_products', p)),
);

server.tool('sitekit_get_menu', '讀取網站架構樹（location=header 主選單｜footer 頁尾）', { location: z.enum(['header', 'footer']).default('header') }, async (p) => asText(await ops('get_menu', p)));
server.tool('sitekit_create_logistics_order', '為已付款的超商取貨／宅配訂單建立綠界物流單', { orderNo: z.string() }, async (p) => asText(await ops('create_logistics_order', p)));
server.tool('sitekit_issue_invoice', '手動開立電子發票（ezPay／綠界／光貿，依 invoice.provider）', { orderNo: z.string() }, async (p) => asText(await ops('issue_invoice', p)));
server.tool('sitekit_invalidate_invoice', '作廢訂單的電子發票', { orderNo: z.string(), reason: z.string().optional() }, async (p) => asText(await ops('invalidate_invoice', p)));
server.tool('sitekit_list_invoices', '列出電子發票', { status: z.enum(['issued', 'failed', 'invalid']).optional() }, async (p) => asText(await ops('list_invoices', p)));
server.tool('sitekit_get_site', '讀取站台外觀：品牌／聯絡／社群／SEO 設定值、首頁區塊、主選單與頁尾選單', {}, async () => asText(await ops('get_site')));
server.tool(
  'sitekit_set_home_sections',
  '設定首頁版面區塊（整組覆寫）。kind：hero{title,subtitle,ctaText,ctaHref,imageUrl,align}｜features{title,items[{title,text,icon}]}｜courses/products/posts{title,limit}｜html{title,html}｜cta{title,text,buttonText,buttonHref}。品牌／聯絡／SEO 用 sitekit_update_settings（brand.*、seo.*）',
  { sections: z.array(z.record(z.any())) },
  async (p) => asText(await ops('set_home_sections', p)),
);
server.tool(
  'sitekit_set_menu',
  '整棵覆寫網站架構樹（兩層）。kind=page 綁 contentId（用 sitekit_list_content 取得）、route 填站內路徑 href、link 填外部網址',
  { location: z.enum(['header', 'footer']).default('header'), items: z.array(z.object({ label: z.string(), kind: z.enum(['page', 'route', 'link']).default('route'), contentId: z.string().optional(), href: z.string().optional(), isVisible: z.boolean().optional(), newTab: z.boolean().optional(), children: z.array(z.object({ label: z.string(), kind: z.enum(['page', 'route', 'link']).default('route'), contentId: z.string().optional(), href: z.string().optional(), isVisible: z.boolean().optional(), newTab: z.boolean().optional() })).optional() })) },
  async (p) => asText(await ops('set_menu', p)),
);
server.tool('sitekit_list_questions', '列出課程學員提問（可依課程 slug／狀態篩選）', { slug: z.string().optional(), courseId: z.string().optional(), status: z.enum(['open', 'answered', 'hidden']).optional() }, async (p) => asText(await ops('list_questions', p)));
server.tool('sitekit_answer_question', '回覆學員提問並通知提問者', { id: z.string(), answer: z.string().min(1), isPublic: z.boolean().optional() }, async (p) => asText(await ops('answer_question', p)));
server.tool('sitekit_post_announcement', '發布課程公告', { slug: z.string().optional(), courseId: z.string().optional(), title: z.string(), body: z.string() }, async (p) => asText(await ops('post_announcement', p)));

server.tool(
  'sitekit_upsert_content',
  '建立或更新官網頁面（type=page，/p/<slug>；slug=home＝首頁）或文章（type=post，/blog/<slug>）的「草稿」。body 為 HTML，或給 design（設計文件 JSON：{root:{type:"root",children:[...]}}，區塊類型 section/container/columns/column/heading/text/richtext/button/spacer/divider/image/video/embed/quote/list/iconbox/card/faq/html/products/courses/posts）。防呆：一律只存草稿、線上頁不動；接著用 sitekit_preview_content 取沙盒預覽連結給人確認，再 sitekit_publish_content（confirm=true）上線。status 只接受 draft|archived（下架）。',
  { slug: z.string(), type: z.enum(['page', 'post']).optional(), title: z.string().optional(), body: z.string().optional(), design: z.any().optional(), excerpt: z.string().optional(), coverUrl: z.string().optional(), tags: z.array(z.string()).optional(), status: z.enum(['draft', 'archived']).optional() },
  async (p) => asText(await ops('upsert_content', p)),
);
server.tool('sitekit_list_products', '列出商品（後台視角：含下架／庫存／分類）', { q: z.string().optional(), type: z.enum(['physical', 'course', 'credit_pack']).optional(), category: z.string().optional(), isActive: z.boolean().optional(), limit: z.number().optional() }, async (p) => asText(await ops('list_products', p)));
server.tool('sitekit_upsert_product', '以 sku 建立或更新商品（上架／下架／改價／分類／封面）', { sku: z.string(), type: z.enum(['physical', 'course', 'credit_pack']).optional(), name: z.string().optional(), price: z.number().optional(), description: z.string().optional(), coverUrl: z.string().optional(), stock: z.number().nullable().optional(), isActive: z.boolean().optional(), category: z.string().optional(), sortOrder: z.number().optional() }, async (p) => asText(await ops('upsert_product', p)));
server.tool('sitekit_set_product_variants', '設定商品多規格（整組覆寫）', { sku: z.string(), specs: z.array(z.object({ name: z.string(), values: z.array(z.string()) })).optional(), variants: z.array(z.object({ id: z.string().optional(), name: z.string(), sku: z.string(), price: z.number().nullable().optional(), stock: z.number().nullable().optional(), isActive: z.boolean().optional(), options: z.record(z.string()).optional() })).optional() }, async (p) => asText(await ops('set_product_variants', p)));
server.tool('sitekit_delete_product', '刪除商品（已有訂單只能下架）', { sku: z.string() }, async (p) => asText(await ops('delete_product', p)));
server.tool('sitekit_list_orders', '列出訂單（scope shop 電商｜course 課程；狀態／物流狀態／日期區間／關鍵字）', { scope: z.enum(['shop', 'course', 'all']).optional(), status: z.enum(['pending', 'paid', 'failed', 'refunded', 'canceled']).optional(), shipping: z.string().optional(), from: z.string().optional(), to: z.string().optional(), q: z.string().optional(), limit: z.number().optional() }, async (p) => asText(await ops('list_orders', p)));
server.tool('sitekit_get_order', '讀取單一訂單', { orderNo: z.string() }, async (p) => asText(await ops('get_order', p)));
server.tool('sitekit_list_courses', '列出課程（含未發布）', {}, async () => asText(await ops('list_courses', {})));
server.tool('sitekit_upsert_course', '以 slug 建立或更新線上課程', { slug: z.string(), name: z.string().optional(), price: z.number().optional(), sku: z.string().optional(), description: z.string().optional(), coverUrl: z.string().optional(), summary: z.string().optional(), isPublished: z.boolean().optional(), accessMode: z.enum(['unlimited', 'days', 'until']).optional(), accessDays: z.number().optional() }, async (p) => asText(await ops('upsert_course', p)));
server.tool('sitekit_add_chapter', '為課程新增章節', { courseSlug: z.string(), title: z.string(), body: z.string().optional(), videoProvider: z.enum(['youtube', 'bunny']).optional(), videoProviderId: z.string().optional(), isPreview: z.boolean().optional(), isPublished: z.boolean().optional(), parentId: z.string().optional(), order: z.number().optional() }, async (p) => asText(await ops('add_chapter', p)));
server.tool('sitekit_generate_image', 'AI 產圖（會產生費用；只支援 provider openai|gemini，Claude 不產圖；未設金鑰時為 mock 佔位圖）：prompt 自由描述，或 templateKey＋inputs 套用產圖模板（先 sitekit_list_image_templates）；referenceImages 為商品照片公開網址 → 回公開 url，可再用 upsert_product 設封面或放進頁面設計', { provider: z.enum(['openai', 'gemini']).optional(), model: z.string().optional(), prompt: z.string().optional(), templateKey: z.string().optional(), inputs: z.record(z.string()).optional(), referenceImages: z.array(z.string()).max(4).optional(), size: z.enum(['1024x1024', '1536x1024', '1024x1536']).optional(), quality: z.enum(['standard', 'high']).optional(), purpose: z.enum(['product', 'banner', 'illustration']).optional() }, async (p) => asText(await ops('generate_image', p)));
server.tool('sitekit_get_tracking', '讀取網站層級追蹤設定（GTM／GA4／Meta Pixel／TikTok／LINE Tag／Google Ads／自訂碼／事件 JS）', {}, async () => asText(await ops('get_tracking', {})));
server.tool('sitekit_set_tracking', '設定網站層級追蹤碼（整份覆蓋：未給欄位清空，先 get 再改）。頁面層級放 design.settings.tracking（頁面）或 doc.tracking（銷售頁）', { ga4: z.string().optional(), gtm: z.string().optional(), fbPixel: z.string().optional(), tiktok: z.string().optional(), lineTag: z.string().optional(), googleAdsId: z.string().optional(), googleAdsLabel: z.string().optional(), head: z.string().optional(), bodyTop: z.string().optional(), bodyBottom: z.string().optional(), events: z.object({ pageView: z.string().optional(), viewContent: z.string().optional(), addToCart: z.string().optional(), initiateCheckout: z.string().optional(), purchase: z.string().optional() }).optional() }, async (p) => asText(await ops('set_tracking', p)));
server.tool('sitekit_list_sales_pages', '列出一頁式銷售頁', {}, async () => asText(await ops('list_sales_pages', {})));
server.tool('sitekit_get_sales_page', '讀取銷售頁草稿（doc 全文＋掛載商品＋檢測＋預覽連結）', { idOrSlug: z.string() }, async (p) => asText(await ops('get_sales_page', p)));
server.tool(
  'sitekit_upsert_sales_page',
  '建立或更新一頁式銷售頁「草稿」（slug 冪等）。doc 深度合併：notice{enabled,text}、countdown{enabled,endsAt,text}、content（設計文件 JSON，可用 addtocart 區塊）、sections{order[],titles,enabled}、items[{productId,kind offer|bundle|product|addon,order,badge}]、theme{primaryColor,background,maxWidth,topPadding,customCss}、display、form、contact、tracking、seo、schedule{openAt,closeAt,closedMessage}、access{passwordEnabled,password}。線上不動；之後 sitekit_preview_sales_page → sitekit_publish_sales_page(confirm)。',
  { slug: z.string(), title: z.string().optional(), code: z.string().optional(), doc: z.any().optional() },
  async (p) => asText(await ops('upsert_sales_page', p)),
);
server.tool('sitekit_preview_sales_page', '產生銷售頁沙盒預覽連結（草稿、2 小時）', { idOrSlug: z.string() }, async (p) => asText(await ops('preview_sales_page', p)));
server.tool('sitekit_publish_sales_page', '發佈銷售頁（confirm=true；自動備份上一版）或下架（unpublish=true）', { idOrSlug: z.string(), confirm: z.boolean().optional(), unpublish: z.boolean().optional(), note: z.string().optional() }, async (p) => asText(await ops('publish_sales_page', p)));
server.tool('sitekit_list_sales_revisions', '列出銷售頁歷史版本', { idOrSlug: z.string() }, async (p) => asText(await ops('list_sales_revisions', p)));
server.tool('sitekit_restore_sales_revision', '把銷售頁歷史版本還原到草稿', { idOrSlug: z.string(), version: z.number() }, async (p) => asText(await ops('restore_sales_revision', p)));
server.tool('sitekit_list_image_templates', '列出 AI 產圖模板（20 組電商／促銷／品牌／招生／門市模板：key、分類、說明、欄位定義）', {}, async () => asText(await ops('list_image_templates', {})));
server.tool('sitekit_upsert_image_template', '以 key 建立或更新 AI 產圖模板（systemPrompt、inputFields[{key,label,type text|textarea|select|image,required,options}]、defaultSize、coverUrl）', { key: z.string(), name: z.string().optional(), category: z.string().optional(), description: z.string().optional(), systemPrompt: z.string().optional(), inputFields: z.array(z.any()).optional(), defaultSize: z.enum(['1024x1024', '1536x1024', '1024x1536']).optional(), costPoints: z.number().optional(), highCostPoints: z.number().optional(), isActive: z.boolean().optional(), sortOrder: z.number().optional(), coverUrl: z.string().optional() }, async (p) => asText(await ops('upsert_image_template', p)));
server.tool('sitekit_list_content', '列出官網頁面與文章', { type: z.enum(['page', 'post']).optional(), status: z.enum(['draft', 'published', 'archived']).optional() }, async (p) => asText(await ops('list_content', p)));
server.tool('sitekit_get_content_draft', '讀取頁面草稿（design JSON／body、與線上是否有差異 dirty、發佈前檢測 lint、沙盒預覽連結）', { idOrSlug: z.string() }, async (p) => asText(await ops('get_content_draft', p)));
server.tool('sitekit_preview_content', '產生沙盒預覽連結（讀草稿、不影響線上、2 小時有效）——發佈前務必先預覽', { idOrSlug: z.string() }, async (p) => asText(await ops('preview_content', p)));
server.tool(
  'sitekit_publish_content',
  '把草稿發佈到線上（必須 confirm=true 表示已經人工確認預覽）。發佈前自動把目前線上版本備份成 revision；lint 有 error 會拒絕。',
  { idOrSlug: z.string(), confirm: z.boolean(), note: z.string().optional() },
  async (p) => asText(await ops('publish_content', p)),
);
server.tool('sitekit_list_revisions', '列出頁面歷史版本（每次發佈前的線上備份）', { idOrSlug: z.string() }, async (p) => asText(await ops('list_revisions', p)));
server.tool('sitekit_restore_revision', '把歷史版本還原到「草稿」（線上不變；之後需 preview＋publish 確認）', { idOrSlug: z.string(), version: z.number() }, async (p) => asText(await ops('restore_revision', p)));
server.tool('sitekit_import_page_design', '匯入設計文件 JSON 建立／更新頁面草稿（不自動發佈）', { slug: z.string().optional(), title: z.string().optional(), type: z.enum(['page', 'post']).optional(), design: z.any(), excerpt: z.string().optional(), coverUrl: z.string().optional() }, async (p) => asText(await ops('import_page_design', p)));
server.tool('sitekit_export_page_design', '匯出頁面設計文件 JSON（草稿優先）', { idOrSlug: z.string() }, async (p) => asText(await ops('export_page_design', p)));
server.tool('sitekit_create_admin', '建立後台管理員（後台帳號與前台會員分離；上線後用此建立第一位管理員）', { email: z.string().email(), password: z.string().min(8), displayName: z.string().optional(), role: z.enum(['admin', 'superadmin']).default('admin') }, async (p) => asText(await ops('create_admin', p)));
server.tool('sitekit_list_members', '會員資料庫：列出前台會員與自動標籤（shop＝電商客戶、course＝課程學員，兩者皆有＝兩個標籤）', { q: z.string().optional(), tag: z.enum(['shop', 'course', 'both', 'none']).optional(), limit: z.number().optional() }, async (p) => asText(await ops('list_members', p)));
server.tool('sitekit_delete_member', '刪除會員（有訂單／點數紀錄者匿名化停用並保留訂單；無交易者直接刪除）', { idOrEmail: z.string().optional(), ids: z.array(z.string()).optional() }, async (p) => asText(await ops('delete_member', p)));
server.tool('sitekit_list_admins', '列出後台管理員', {}, async () => asText(await ops('list_admins')));
server.tool('sitekit_update_admin', '修改管理員密碼／名稱／角色／狀態', { idOrEmail: z.string(), password: z.string().min(8).optional(), displayName: z.string().optional(), role: z.enum(['admin', 'superadmin']).optional(), status: z.enum(['active', 'suspended']).optional() }, async (p) => asText(await ops('update_admin', p)));
server.tool('sitekit_delete_admin', '刪除管理員（不可刪最後一位 superadmin）', { idOrEmail: z.string() }, async (p) => asText(await ops('delete_admin', p)));
server.tool('sitekit_send_test_notification', '寄測試信（to 可選）並推 LINE 給管理員，驗證通知設定', { to: z.string().email().optional() }, async (p) => asText(await ops('send_test_notification', p)));
server.tool('sitekit_storage_status', '物件儲存（local／R2）與通知中心設定狀態、最近通知紀錄', {}, async () => asText(await ops('storage_status')));

const transport = new StdioServerTransport();
await server.connect(transport);

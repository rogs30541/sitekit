/** 品牌設定：換品牌只改這裡（之後改為從 settings 表讀取） */
export const BRAND = {
  name: 'AIGC創客',
  siteName: 'AIGC創客架站套件',
  description: '電商開店／線上課程／品牌網站通用骨架',
  locale: 'zh-Hant',
} as const;

export type Role = 'user' | 'admin' | 'superadmin';
export const ADMIN_ROLES: readonly Role[] = ['admin', 'superadmin'];

/** 功能旗標：後端算好下發給前端，前端只做顯示 */
export const FEATURES = ['shop', 'courses', 'studio', 'credits', 'storage', 'byok'] as const;
export type Feature = (typeof FEATURES)[number];

/**
 * 金流供應商：none＝未設定、mock＝本機假閘道（非 production）；
 * newebpay＝藍新 MPG、payuni＝統一金流 UPP、ecpay＝綠界 AIO、linepay＝LINE Pay v3、pchomepay＝支付連。
 * 結帳可同時開放多個（settings `payment.methods` 逗號清單；空＝只用 `payment.provider`）。
 */
export const PAYMENT_PROVIDERS = ['none', 'mock', 'newebpay', 'payuni', 'ecpay', 'linepay', 'pchomepay'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
/** 可對外提供的付款方式（排除 none）與顯示名稱 */
export const PAYMENT_METHOD_LABELS: Record<Exclude<PaymentProvider, 'none'>, string> = {
  mock: '測試假閘道',
  newebpay: '藍新金流',
  payuni: '統一金流 PAYUNi',
  ecpay: '綠界科技',
  linepay: 'LINE Pay',
  pchomepay: '支付連',
};

export const ORDER_STATUSES = ['pending', 'paid', 'failed', 'refunded', 'canceled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** 設定鍵名（settings 表；env 備援鍵見 api SettingsService） */
export const SETTING_KEYS = {
  siteUrl: 'site.url',
  paymentProvider: 'payment.provider',
  newebpayMerchantId: 'newebpay.merchantId',
  newebpayHashKey: 'newebpay.hashKey',
  newebpayHashIv: 'newebpay.hashIv',
  newebpayGatewayUrl: 'newebpay.gatewayUrl',
  newebpayTestMode: 'newebpay.testMode',
  paymentMethods: 'payment.methods',
  payuniMerchantId: 'payuni.merchantId',
  payuniHashKey: 'payuni.hashKey',
  payuniHashIv: 'payuni.hashIv',
  payuniTestMode: 'payuni.testMode',
  ecpayMerchantId: 'ecpay.merchantId',
  ecpayHashKey: 'ecpay.hashKey',
  ecpayHashIv: 'ecpay.hashIv',
  ecpayTestMode: 'ecpay.testMode',
  linepayChannelId: 'linepay.channelId',
  linepayChannelSecret: 'linepay.channelSecret',
  linepayTestMode: 'linepay.testMode',
  pchomepayAppId: 'pchomepay.appId',
  pchomepayAppSecret: 'pchomepay.appSecret',
  pchomepayTestMode: 'pchomepay.testMode',
  ezpayEnabled: 'ezpay.enabled',
  ezpayMerchantId: 'ezpay.merchantId',
  ezpayHashKey: 'ezpay.hashKey',
  ezpayHashIv: 'ezpay.hashIv',
  ezpayApiUrl: 'ezpay.apiUrl',
  bunnyLibraryId: 'bunny.libraryId',
  bunnySigningKey: 'bunny.signingKey',
  shippingFee: 'shipping.fee',
  shippingFreeOver: 'shipping.freeOver',
  orderExpireHours: 'order.expireHours',
  storageDriver: 'storage.driver',
  s3Endpoint: 's3.endpoint',
  s3Bucket: 's3.bucket',
  s3Region: 's3.region',
  s3AccessKeyId: 's3.accessKeyId',
  s3SecretAccessKey: 's3.secretAccessKey',
  s3PublicUrl: 's3.publicUrl',
  notifyEmailProvider: 'notify.emailProvider',
  resendApiKey: 'resend.apiKey',
  mailFrom: 'mail.from',
  mailAdminTo: 'mail.adminTo',
  lineChannelToken: 'line.channelToken',
  lineAdminUserId: 'line.adminUserId',
  adminRegisterAllowlist: 'admin.registerAllowlist',
  brandName: 'brand.name',
  brandSiteName: 'brand.siteName',
  brandDescription: 'brand.description',
  brandTagline: 'brand.tagline',
  brandLogoUrl: 'brand.logoUrl',
  brandPrimaryColor: 'brand.primaryColor',
  brandContactEmail: 'brand.contactEmail',
  brandPhone: 'brand.phone',
  brandAddress: 'brand.address',
  brandFacebook: 'brand.facebook',
  brandInstagram: 'brand.instagram',
  brandLine: 'brand.line',
  brandYoutube: 'brand.youtube',
  brandFooterText: 'brand.footerText',
  seoOgImage: 'seo.ogImage',
  seoGaId: 'seo.gaId',
  /** 網站層級追蹤碼（tracking.events 為 JSON） */
  trackingGa4: 'tracking.ga4',
  trackingGtm: 'tracking.gtm',
  trackingFbPixel: 'tracking.fbPixel',
  trackingTiktok: 'tracking.tiktok',
  trackingLineTag: 'tracking.lineTag',
  trackingGoogleAdsId: 'tracking.googleAdsId',
  trackingGoogleAdsLabel: 'tracking.googleAdsLabel',
  trackingHead: 'tracking.head',
  trackingBodyTop: 'tracking.bodyTop',
  trackingBodyBottom: 'tracking.bodyBottom',
  trackingEvents: 'tracking.events',
  homeSections: 'home.sections',
  logisticsProvider: 'logistics.provider',
  logisticsMethods: 'logistics.methods',
  logisticsFees: 'logistics.fees',
  logisticsSenderName: 'logistics.senderName',
  logisticsSenderPhone: 'logistics.senderPhone',
  logisticsSenderZip: 'logistics.senderZip',
  logisticsSenderAddress: 'logistics.senderAddress',
  ecpayLogisticsMerchantId: 'ecpayLogistics.merchantId',
  ecpayLogisticsHashKey: 'ecpayLogistics.hashKey',
  ecpayLogisticsHashIv: 'ecpayLogistics.hashIv',
  ecpayLogisticsTestMode: 'ecpayLogistics.testMode',
  invoiceProvider: 'invoice.provider',
  invoiceIssueTiming: 'invoice.issueTiming',
  ezpayTestMode: 'ezpay.testMode',
  ecpayInvoiceMerchantId: 'ecpayInvoice.merchantId',
  ecpayInvoiceHashKey: 'ecpayInvoice.hashKey',
  ecpayInvoiceHashIv: 'ecpayInvoice.hashIv',
  ecpayInvoiceTestMode: 'ecpayInvoice.testMode',
  amegoTaxId: 'amego.taxId',
  amegoAppKey: 'amego.appKey',
  googleClientId: 'google.clientId',
  googleClientSecret: 'google.clientSecret',
  lineLoginChannelId: 'line.loginChannelId',
  lineLoginChannelSecret: 'line.loginChannelSecret',
  aiProvider: 'ai.provider',
  openaiApiKey: 'openai.apiKey',
  aiImageModel: 'ai.imageModel',
  /** AI 指令台（後台總控）：mock|anthropic|openai；模型；Anthropic 金鑰 */
  aiCommandProvider: 'ai.commandProvider',
  aiCommandModel: 'ai.commandModel',
  anthropicApiKey: 'anthropic.apiKey',
} as const;

/**
 * 後台維運動作清單 —— MCP 路徑與 AI API 路徑共用的唯一真相源。
 * 新增維運功能：先在此登記，再於 OpsService 實作。
 */
export const OPS_ACTIONS = {
  status: { desc: '讀取系統狀態（版本、環境、服務健康）', mutating: false },
  deploy: { desc: '觸發部署（指定 web / api / all）', mutating: true },
  migrate: { desc: '執行資料庫遷移（prisma migrate deploy）', mutating: true },
  get_settings: { desc: '讀取系統設定（不含機密明文）', mutating: false },
  update_settings: { desc: '更新系統設定（品牌、金流、發票、影片等鍵值）', mutating: true },
  import_content: { desc: '外站內容匯入（WordPress / CSV，冪等 upsert）', mutating: true },
  adjust_credits: { desc: '調整用戶點數（客服補點、活動贈點、沖正；需 email 或 userId、amount、reason）', mutating: true },
  audit: { desc: '讀取稽核日誌', mutating: false },
  sales_report: { desc: '（scope shop|course|all）銷售報表（期間營收、訂單數、客單價、各商品銷量、退款、金流分布；from/to ISO 日期、groupBy day|month）', mutating: false },
  update_shipping: { desc: '更新訂單物流（orderNo、status pending|shipped|delivered|returned、carrier、trackingNo）', mutating: true },
  manage_coupon: { desc: '（scope shop|course|all 適用範疇）折扣碼建立／修改／停用（op create|update|disable、code、type percent|fixed、value、minAmount、maxUses、expiresAt）', mutating: true },
  adjust_stock: { desc: '調整商品庫存（sku 或 productId；set 絕對值或 delta 增減；null＝不追蹤）', mutating: true },
  expire_orders: { desc: '取消逾期未付款訂單並回補庫存（hours 預設讀 order.expireHours）', mutating: true },
  get_menu: { desc: '讀取網站架構樹（location header 主選單｜footer 頁尾，含隱藏節點）', mutating: false },
  set_menu: { desc: '整棵覆寫網站架構樹：location header|footer、items[{label, kind page|route|link, contentId 或 href, isVisible, newTab, children[]}]（兩層）', mutating: true },
  create_logistics_order: { desc: '為已付款的超商取貨／宅配訂單建立綠界物流單（orderNo）', mutating: true },
  issue_invoice: { desc: '手動開立電子發票（orderNo；依 invoice.provider）', mutating: true },
  invalidate_invoice: { desc: '作廢訂單的電子發票（orderNo）', mutating: true },
  list_invoices: { desc: '列出電子發票（status issued|failed|invalid 可選）', mutating: false },
  get_site: { desc: '讀取站台外觀（品牌／聯絡／社群／SEO 設定值、首頁區塊、選單）', mutating: false },
  set_home_sections: { desc: '設定首頁版面區塊 sections[]（hero／features／courses／products／posts／html／cta；伺服器驗證）', mutating: true },
  list_questions: { desc: '列出課程問答（courseId 或 slug 可選、status open|answered|hidden）', mutating: false },
  answer_question: { desc: '回覆學員提問（id、answer；isPublic 可選）——會通知提問者', mutating: true },
  post_announcement: { desc: '發布課程公告（courseId 或 slug、title、body）', mutating: true },
  upsert_content: { desc: '建立或更新官網頁面／文章「草稿」（type page|post、slug、title、body HTML 或 design JSON、excerpt、coverUrl、tags；以 slug 冪等；一律先存草稿，不直接改線上頁，要上線請用 publish_content）', mutating: true },
  list_content: { desc: '列出內容（type、status 可選；含 hasDraft／version）', mutating: false },
  get_content_draft: { desc: '讀取頁面草稿（含 design JSON、沙盒預覽連結、發佈前檢測結果）', mutating: false },
  preview_content: { desc: '產生沙盒預覽連結（草稿內容、不影響線上；連結 2 小時有效）', mutating: false },
  publish_content: { desc: '把草稿發佈到線上（必須 confirm=true；發佈前先把目前線上版本備份成 revision、可回滾；發佈前檢測有 error 則拒絕）', mutating: true },
  list_revisions: { desc: '列出頁面的歷史版本（每次發佈前的線上備份）', mutating: false },
  restore_revision: { desc: '把某個歷史版本還原到「草稿」（不直接改線上；還原後需 publish_content 確認才上線）', mutating: true },
  import_page_design: { desc: '匯入設計文件 JSON（design doc 或 blocks 陣列）建立／更新頁面草稿；不會自動發佈', mutating: true },
  export_page_design: { desc: '匯出頁面設計文件 JSON（草稿優先，否則線上版）', mutating: false },
  create_admin: { desc: '建立後台管理員（email、password ≥8、role admin|superadmin；後台帳號與前台會員分離）', mutating: true },
  list_admins: { desc: '列出後台管理員', mutating: false },
  update_admin: { desc: '修改管理員（idOrEmail；password／displayName／role／status active|suspended）', mutating: true },
  delete_admin: { desc: '刪除管理員（idOrEmail；不可刪最後一位 superadmin）', mutating: true },
  send_test_notification: { desc: '寄一封測試信（to 可選，預設 mail.adminTo）並推一則 LINE 給管理員，回各通道結果', mutating: true },
  storage_status: { desc: '物件儲存狀態（driver local|s3、R2 是否設定完成）與最近通知紀錄', mutating: false },
  list_products: { desc: '列出商品（後台視角，含下架／庫存／分類；q 關鍵字、type physical|course|credit_pack、category、isActive、limit）', mutating: false },
  upsert_product: { desc: '以 sku 建立或更新商品（name、price 整數、type、description、coverUrl、stock、isActive 上架/下架、category 分類、sortOrder）', mutating: true },
  set_product_variants: { desc: '設定商品多規格（sku 或 id；specs[{name,values[]}]、variants[{name,sku,price|null 沿用主商品,stock|null 不追蹤,isActive,options{規格:值}}]；整組覆寫，已有訂單的規格改下架）', mutating: true },
  delete_product: { desc: '刪除商品（sku 或 id；已有訂單紀錄只能下架、課程商品到課程管理處理）', mutating: true },
  list_orders: { desc: '列出訂單（scope shop|course 電商或課程、status pending|paid|failed|refunded|canceled、shipping、from/to 日期、q 訂單編號或 Email、limit）', mutating: false },
  get_order: { desc: '讀取單一訂單完整資料（orderNo 或 id）', mutating: false },
  list_courses: { desc: '列出課程（含未發布；slug、商品、章節數）', mutating: false },
  upsert_course: { desc: '以 slug 建立或更新線上課程（product{sku,name,price,description,coverUrl}、summary、isPublished、accessMode）', mutating: true },
  add_chapter: { desc: '為課程新增章節（courseSlug、title、body、videoProvider youtube|bunny、videoProviderId、isPreview、parentId）', mutating: true },
  generate_image: { desc: 'AI 產圖（prompt；或 templateKey＋inputs{欄位key:值} 套用產圖模板；referenceImages[] 參考圖網址≤4；size 1024x1024|1536x1024|1024x1536、quality standard|high、purpose product|banner|illustration）→ 存到儲存空間回公開 url；會產生費用', mutating: true },
  get_tracking: { desc: '讀取網站層級追蹤設定（GTM／GA4／Meta Pixel／TikTok／LINE Tag／Google Ads／自訂 Head・Body 碼／購物車事件 JS）', mutating: false },
  set_tracking: { desc: '設定網站層級追蹤碼（套用到所有頁面；ga4、gtm、fbPixel、tiktok、lineTag、googleAdsId、googleAdsLabel、head、bodyTop、bodyBottom、events{pageView,viewContent,addToCart,initiateCheckout,purchase}）', mutating: true },
  list_sales_pages: { desc: '列出一頁式銷售頁（slug、標題、狀態、版本、是否有未發佈草稿）', mutating: false },
  get_sales_page: { desc: '讀取銷售頁草稿全文（doc：通知／倒數／內文設計文件／產品區塊／表單／順序／追蹤／SEO／排程）＋掛載商品＋檢測＋預覽連結', mutating: false },
  upsert_sales_page: { desc: '建立或更新一頁式銷售頁「草稿」（slug 冪等；title、code 訂單前綴、doc 深度合併：notice/countdown/content(設計文件)/sections/items[{productId,kind offer|bundle|product|addon,order,badge}]/theme/display/form/contact/tracking/seo/schedule/access）；線上不動，需 publish_sales_page 確認', mutating: true },
  preview_sales_page: { desc: '產生銷售頁沙盒預覽連結（草稿、2 小時）', mutating: false },
  publish_sales_page: { desc: '把銷售頁草稿發佈上線（confirm=true；發佈前自動備份上一版；lint error 拒絕）；unpublish=true 則下架', mutating: true },
  list_sales_revisions: { desc: '列出銷售頁歷史版本', mutating: false },
  restore_sales_revision: { desc: '把銷售頁歷史版本還原到草稿（線上不變）', mutating: true },
  list_image_templates: { desc: '列出 AI 產圖模板（key、名稱、分類、說明、欄位定義、預設尺寸；商品製圖／Banner 先用此挑模板）', mutating: false },
  upsert_image_template: { desc: '以 key 建立或更新 AI 產圖模板（name、category、description、systemPrompt、inputFields[]、defaultSize、costPoints、highCostPoints、isActive、sortOrder；coverBase64＋coverMime 上傳封面）', mutating: true },
  import_products: { desc: '商品 CSV 匯入（sku,name,price,type,description,cover_url,stock,active；相容 Shopify 商品 CSV；dryRun 預設 true）', mutating: true },
} as const;

export const SHIPPING_STATUSES = ['pending', 'shipped', 'delivered', 'returned'] as const;
export type ShippingStatus = (typeof SHIPPING_STATUSES)[number];
export const SHIPPING_LABELS: Record<ShippingStatus, string> = { pending: '待出貨', shipped: '已出貨', delivered: '已送達', returned: '已退回' };
export const COUPON_TYPES = ['percent', 'fixed'] as const;

/** 配送方式（綠界物流子類型＋自行配送） */
export const LOGISTICS_METHOD_LABELS = { manual: '自行配送／宅配', UNIMARTC2C: '7-ELEVEN 超商取貨（綠界）', FAMIC2C: '全家超商取貨（綠界）', HILIFEC2C: '萊爾富超商取貨（綠界）', OKMARTC2C: 'OK 超商取貨（綠界）', TCAT: '黑貓宅急便（綠界）', ECAN: '宅配通（綠界）', NWP_UNIMART: '7-ELEVEN 超商取貨（藍新）', NWP_FAMILY: '全家超商取貨（藍新）', NWP_HILIFE: '萊爾富超商取貨（藍新）', NWP_OK: 'OK 超商取貨（藍新）' } as const;
export type LogisticsMethodId = keyof typeof LOGISTICS_METHOD_LABELS;
/** 發票類型 */
export const INVOICE_TYPE_LABELS: Record<string, string> = { personal: '個人（Email／會員載具）', mobile: '手機條碼載具', citizen: '自然人憑證', company: '公司統編（三聯式）', donate: '捐贈' };
export const INVOICE_STATUS_LABELS: Record<string, string> = { issued: '已開立', failed: '開立失敗', invalid: '已作廢' };

/** 介面顯示用中文標籤（前後台共用；未知值回原字串） */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = { pending: '待付款', paid: '已付款', failed: '付款失敗', refunded: '已退款', canceled: '已取消' };
export const REFUND_STATUS_LABELS: Record<string, string> = { requested: '申請中', rejected: '已駁回', done: '已退款' };
export const ROLE_LABELS: Record<Role, string> = { user: '會員', admin: '管理員', superadmin: '超級管理員' };
export const PAYMENT_TYPE_LABELS: Record<string, string> = { CREDIT: '信用卡', VACC: 'ATM 轉帳', CVS: '超商代碼', BARCODE: '超商條碼', WEBATM: 'WebATM', LINEPAY: 'LINE Pay', Credit_CreditCard: '信用卡', ATM: 'ATM 轉帳', CARD: '信用卡', ACCT: '支付連帳戶', AFTEE: '先享後付' };
export const PROVIDER_LABELS: Record<string, string> = { ...PAYMENT_METHOD_LABELS, free: '免費', manual: '人工核帳', unknown: '未知', amego: '光貿', ezpay: 'ezPay', ecpay: '綠界' };
export const QUESTION_STATUS_LABELS: Record<string, string> = { open: '待回覆', answered: '已回覆', hidden: '已隱藏' };
export const CONTENT_STATUS_LABELS: Record<string, string> = { draft: '草稿', published: '已發布', archived: '封存' };
export const CONTENT_SOURCE_LABELS: Record<string, string> = { admin: '後台編輯', wordpress: 'WordPress 搬運', csv: 'CSV 匯入', seed: '示範資料' };
export const LEDGER_TYPE_LABELS: Record<string, string> = { grant: '贈點', consume: '扣點', adjust: '調整', purchase: '購買', refund: '退還' };
export const STORAGE_DRIVER_LABELS: Record<string, string> = { local: '本機磁碟', s3: 'Cloudflare R2／S3' };
export const EMAIL_PROVIDER_LABELS: Record<string, string> = { log: '只記 log（不寄信）', resend: 'Resend' };
/** 付款方式顯示：供應商＋付款型態，例「藍新金流・信用卡」 */
export const paymentLabel = (provider?: string | null, paymentType?: string | null) => {
  const p = provider ? (PROVIDER_LABELS[provider] ?? provider) : '';
  const t = paymentType ? (PAYMENT_TYPE_LABELS[paymentType] ?? PAYMENT_TYPE_LABELS[paymentType.split(':')[0]] ?? paymentType) : '';
  return [p, t].filter(Boolean).join('・');
};
export type OpsAction = keyof typeof OPS_ACTIONS;
export const OPS_ACTION_KEYS = Object.keys(OPS_ACTIONS) as OpsAction[];

export interface OpsRequest<A extends OpsAction = OpsAction> {
  action: A;
  params?: Record<string, unknown>;
}
export interface OpsResult {
  ok: boolean;
  action: OpsAction;
  actor: string;
  at: string;
  data?: unknown;
  error?: string;
}

export * from './design';

/** AI 指令台排除的「系統功能」動作（只在系統功能選單人工操作，不開放自然語言指令） */
export const COMMAND_EXCLUDED_ACTIONS: OpsAction[] = ['status', 'deploy', 'migrate', 'get_settings', 'update_settings', 'import_content', 'adjust_credits', 'audit', 'create_admin', 'list_admins', 'update_admin', 'delete_admin', 'send_test_notification', 'storage_status'];

/** 指令台七大工作項目（快捷任務；範例指令會填入輸入框） */
export const COMMAND_TASKS: { key: string; label: string; desc: string; examples: string[] }[] = [
  { key: 'page', label: '前端頁面編輯', desc: '建立／修改官網頁面草稿、產生沙盒預覽、經確認發佈', examples: ['幫我建立「關於我們」頁面草稿：一段品牌故事＋三個特色卡片＋聯絡方式，做好給我預覽連結', '把 about 頁的標題改成「我們是誰」，存草稿並給我預覽'] },
  { key: 'orders', label: '後端電商處理', desc: '訂單查詢、出貨、物流單、發票、折扣碼、庫存', examples: ['列出今天已付款但未出貨的訂單', '訂單 SK... 標記已出貨，黑貓 單號 1234567890，並開立發票'] },
  { key: 'report', label: '電商報表分析', desc: '銷售報表、對帳、趨勢摘要', examples: ['幫我看這個月的銷售報表，按天分組，告訴我最好的三天和原因', '比較上個月和這個月的營收與訂單數'] },
  { key: 'image', label: '商品製圖', desc: 'AI 產生商品情境圖／主圖並設定到商品', examples: ['幫 SKU DEMO-MUG 產生一張白底簡約的商品主圖，1024x1024，並設成商品封面'] },
  { key: 'product', label: '商品上架／分類', desc: '新增商品、改價、上下架、分類整理', examples: ['上架商品：SKU AI-TEE、名稱「AI 創客 T 恤」、價格 590、分類 服飾、庫存 50', '把所有分類是「服飾」的商品下架'] },
  { key: 'course', label: '線上課程上架', desc: '建立課程、章節、發布', examples: ['建立課程 slug ai-basics「AI 入門」，價格 1990，摘要一句話，先不發布，並新增三個章節：認識 AI、提示詞入門、實作練習'] },
  { key: 'sales', label: '一頁式銷售頁', desc: '建立銷售頁草稿：內文＋掛商品＋表單規則，預覽後確認上線', examples: ['建立一頁式銷售頁 slug autumn-sale「秋季限定組合」：內文放 Hero＋三個賣點，掛上 SKU DEMO-MUG 當優惠區塊、DEMO-TEE 當一般產品，先存草稿給我預覽'] },
  { key: 'banner', label: 'BANNER 設計', desc: 'AI 產生橫幅圖並放進頁面／首頁區塊草稿', examples: ['做一張秋季課程優惠的 Banner（1536x1024，暖色系），放進首頁草稿最上方的 Hero 區塊，給我預覽'] },
];
export * from './sales';
export * from './tracking';

/** 訂單／折扣碼範疇：電商與課程各自獨立的購物車、訂單、折扣碼、報表 */
export const ORDER_SCOPES = ['shop', 'course'] as const;
export type OrderScope = (typeof ORDER_SCOPES)[number];
export const ORDER_SCOPE_LABELS: Record<string, string> = { shop: '電商', course: '課程', all: '電商＋課程' };

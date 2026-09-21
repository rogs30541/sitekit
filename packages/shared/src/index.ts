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
  aiProvider: 'ai.provider',
  openaiApiKey: 'openai.apiKey',
  aiImageModel: 'ai.imageModel',
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
  sales_report: { desc: '銷售報表（期間營收、訂單數、客單價、各商品銷量、退款、金流分布；from/to ISO 日期、groupBy day|month）', mutating: false },
  update_shipping: { desc: '更新訂單物流（orderNo、status pending|shipped|delivered|returned、carrier、trackingNo）', mutating: true },
  manage_coupon: { desc: '折扣碼建立／修改／停用（op create|update|disable、code、type percent|fixed、value、minAmount、maxUses、expiresAt）', mutating: true },
  adjust_stock: { desc: '調整商品庫存（sku 或 productId；set 絕對值或 delta 增減；null＝不追蹤）', mutating: true },
  expire_orders: { desc: '取消逾期未付款訂單並回補庫存（hours 預設讀 order.expireHours）', mutating: true },
  upsert_content: { desc: '建立或更新官網頁面／文章（type page|post、slug、title、body HTML、excerpt、coverUrl、tags、status draft|published；以 slug 冪等）', mutating: true },
  list_content: { desc: '列出內容（type、status 可選）', mutating: false },
  create_admin: { desc: '建立後台管理員（email、password ≥8、role admin|superadmin；後台帳號與前台會員分離）', mutating: true },
  list_admins: { desc: '列出後台管理員', mutating: false },
  update_admin: { desc: '修改管理員（idOrEmail；password／displayName／role／status active|suspended）', mutating: true },
  delete_admin: { desc: '刪除管理員（idOrEmail；不可刪最後一位 superadmin）', mutating: true },
  send_test_notification: { desc: '寄一封測試信（to 可選，預設 mail.adminTo）並推一則 LINE 給管理員，回各通道結果', mutating: true },
  storage_status: { desc: '物件儲存狀態（driver local|s3、R2 是否設定完成）與最近通知紀錄', mutating: false },
  import_products: { desc: '商品 CSV 匯入（sku,name,price,type,description,cover_url,stock,active；相容 Shopify 商品 CSV；dryRun 預設 true）', mutating: true },
} as const;

export const SHIPPING_STATUSES = ['pending', 'shipped', 'delivered', 'returned'] as const;
export type ShippingStatus = (typeof SHIPPING_STATUSES)[number];
export const SHIPPING_LABELS: Record<ShippingStatus, string> = { pending: '待出貨', shipped: '已出貨', delivered: '已送達', returned: '已退回' };
export const COUPON_TYPES = ['percent', 'fixed'] as const;
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

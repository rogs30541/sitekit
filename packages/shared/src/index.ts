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

/** 金流供應商：none＝未設定、mock＝本機假閘道（非 production）、newebpay＝藍新 MPG */
export const PAYMENT_PROVIDERS = ['none', 'mock', 'newebpay'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

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
  ezpayEnabled: 'ezpay.enabled',
  ezpayMerchantId: 'ezpay.merchantId',
  ezpayHashKey: 'ezpay.hashKey',
  ezpayHashIv: 'ezpay.hashIv',
  ezpayApiUrl: 'ezpay.apiUrl',
  bunnyLibraryId: 'bunny.libraryId',
  bunnySigningKey: 'bunny.signingKey',
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
  audit: { desc: '讀取稽核日誌', mutating: false },
} as const;
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

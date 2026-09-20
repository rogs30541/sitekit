/** 品牌設定：換品牌只改這裡（之後改為從 settings 表讀取） */
export const BRAND = {
  name: 'SiteKit',
  siteName: 'SiteKit 架站套件',
  description: '電商開店／線上課程／品牌網站通用骨架',
  locale: 'zh-Hant',
} as const;

export type Role = 'user' | 'admin' | 'superadmin';
export const ADMIN_ROLES: readonly Role[] = ['admin', 'superadmin'];

/** 功能旗標：後端算好下發給前端，前端只做顯示 */
export const FEATURES = ['shop', 'courses', 'studio', 'credits', 'storage', 'byok'] as const;
export type Feature = (typeof FEATURES)[number];

/**
 * 後台維運動作清單 —— MCP 路徑與 AI API 路徑共用的唯一真相源。
 * 新增維運功能：先在此登記，再於 OpsService 實作。
 */
export const OPS_ACTIONS = {
  status: { desc: '讀取系統狀態（版本、環境、服務健康）', mutating: false },
  deploy: { desc: '觸發部署（指定 web / api / all）', mutating: true },
  migrate: { desc: '執行資料庫遷移（prisma migrate deploy）', mutating: true },
  get_settings: { desc: '讀取系統設定（不含機密明文）', mutating: false },
  update_settings: { desc: '更新系統設定（品牌、金流、通知等鍵值）', mutating: true },
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

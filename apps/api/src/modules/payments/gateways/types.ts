import type { PaymentProvider } from '@sitekit/shared';

/** 各金流商的設定（由 SettingsService.gateway() 組出；secret 類值不回傳給前端） */
export interface GatewayConfig {
  provider: PaymentProvider;
  testMode: boolean;
  configured: boolean;
  /** 藍新／綠界／統一：商店代號＋HashKey／HashIV；LINE Pay：channelId／channelSecret；支付連：appId／appSecret */
  merchantId: string;
  hashKey: string;
  hashIv: string;
  /** 藍新專用：明確指定的閘道網址（空＝依 testMode 決定） */
  gatewayUrl?: string;
}

export interface CheckoutInput {
  merchantOrderNo: string;
  amount: number;
  items: { name: string; qty: number; unitPrice: number }[];
  email: string;
  site: string;
  /** 伺服器對伺服器回呼：<site>/api/payments/<provider>/notify */
  notifyUrl: string;
  /** 前景導回（POST 或 GET）：<site>/api/payments/<provider>/return */
  returnUrl: string;
  /** 使用者按「返回商店」：會員中心 */
  clientBackUrl: string;
  /** 取消付款導回 */
  cancelUrl: string;
}

/** 前端依 kind 處理：form＝自動送出表單、redirect＝直接導向 */
export type CheckoutPayload =
  | { provider: PaymentProvider | 'free'; kind: 'redirect'; redirectUrl: string; tradeNo?: string }
  | { provider: PaymentProvider; kind: 'form'; gatewayUrl: string; fields: Record<string, string>; tradeNo?: string };

export type NotifyOutcome =
  | { verified: false; merchantOrderNo: string | null; reason: string }
  | {
      verified: true;
      merchantOrderNo: string;
      /** paid＝付款完成；vacc_issued＝ATM／超商取號（尚未付款）；failed＝失敗；ignored＝已處理或無需動作 */
      kind: 'paid' | 'vacc_issued' | 'failed' | 'ignored';
      tradeNo?: string;
      amount?: number;
      paymentType?: string;
      paidAt?: Date;
      virtualAccount?: string;
      expireAt?: Date | null;
      message?: string;
      raw: unknown;
    };

export interface OrderSnapshot {
  id: string;
  merchantOrderNo: string;
  amount: number;
  status: string;
  providerTradeNo: string | null;
}

export interface HandleContext {
  source: 'notify' | 'return';
  /** 依商店訂單編號查訂單（LINE Pay confirm、支付連查單需要金額） */
  getOrder: (merchantOrderNo: string) => Promise<OrderSnapshot | null>;
}

export interface RefundResult {
  ok: boolean;
  via: string;
  message: string;
}

/**
 * 金流商介面。鐵律：handle() 只負責「驗證」與「解讀」，授權一律由 PaymentsService → OrdersService.markPaid 寫入。
 */
export interface Gateway {
  id: PaymentProvider;
  label: string;
  /** 回呼要回什麼字串給金流商（避免重送） */
  ack: (ok: boolean) => string;
  checkout(cfg: GatewayConfig, i: CheckoutInput): Promise<CheckoutPayload>;
  handle(cfg: GatewayConfig, body: Record<string, unknown>, ctx: HandleContext): Promise<NotifyOutcome>;
  refund?(cfg: GatewayConfig, order: OrderSnapshot): Promise<RefundResult>;
}

export const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
export const toDate = (v: unknown, fallback = new Date()): Date => {
  const s = str(v).trim();
  if (!s) return fallback;
  const iso = /^\d{4}[-/]\d{2}[-/]\d{2}/.test(s) ? s.replace(/\//g, '-').replace(' ', 'T') + (/[+Z]/.test(s.slice(10)) ? '' : '+08:00') : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : d;
};
/** YYYYMMDD／YYYY-MM-DD／YYYY/MM/DD → 當日 23:59:59（台北） */
export const toExpire = (v: unknown): Date | null => {
  const m = str(v).match(/(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};
export const formUrlencoded = (p: Record<string, string | number>) => new URLSearchParams(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]))).toString();

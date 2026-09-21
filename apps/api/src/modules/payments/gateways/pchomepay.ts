import { str, toDate, toExpire, type Gateway, type GatewayConfig, type NotifyOutcome } from './types';

const host = (cfg: GatewayConfig) => (cfg.testMode ? 'https://sandbox-api.pchomepay.com.tw' : 'https://api.pchomepay.com.tw');

let tokenCache: { key: string; token: string; exp: number } | null = null;

/** 支付連 v2：先以 APP ID／Secret（Basic）換 token，其餘 API 帶 pcpay-token。 */
async function token(cfg: GatewayConfig) {
  const key = `${cfg.testMode}:${cfg.merchantId}`;
  if (tokenCache && tokenCache.key === key && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const res = await fetch(`${host(cfg)}/v2/token`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${cfg.merchantId}:${cfg.hashKey}`).toString('base64')}` } });
  const j = (await res.json().catch(() => ({}))) as { token?: string; expired_timestamp?: number; error?: string; error_message?: string };
  if (!j.token) throw new Error(`pchomepay token failed: ${j.error ?? res.status} ${j.error_message ?? ''}`);
  tokenCache = { key, token: j.token, exp: (j.expired_timestamp ?? Math.floor(Date.now() / 1000) + 3600) * 1000 };
  return j.token;
}

async function api<T = Record<string, unknown>>(cfg: GatewayConfig, method: 'POST' | 'GET', path: string, body?: unknown): Promise<T & { error?: string; error_message?: string; _status: number }> {
  const res = await fetch(`${host(cfg)}${path}`, { method, headers: { 'content-type': 'application/json', 'pcpay-token': await token(cfg) }, body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string; error_message?: string };
  return { ...j, _status: res.status };
}

interface PaymentInfo {
  order_id?: string;
  payment_id?: string;
  status?: string;
  amount?: number | string;
  pay_type?: string;
  pay_time?: string;
  virt_account?: string;
  bank_code?: string;
  expired_at?: string;
  [k: string]: unknown;
}

/**
 * 支付連 PChomePay v2：伺服器建立付款取得 payment_url 導向；notify_url 收到通知後不信任通知內容，
 * 一律回查 GET /v2/payment/{order_id}，status=S 才算付款完成。
 * 設定：merchantId＝APP ID、hashKey＝APP Secret。（依公開文件實作，需以沙箱帳號實測）
 */
export const pchomepayGateway: Gateway = {
  id: 'pchomepay',
  label: '支付連',
  ack: (ok) => (ok ? 'OK' : 'IGNORED'),

  async checkout(cfg, i) {
    const r = await api<{ payment_url?: string; payment_id?: string }>(cfg, 'POST', '/v2/payment', {
      order_id: i.merchantOrderNo,
      amount: Math.round(i.amount),
      item_name: i.items.map((x) => x.name).join('、').slice(0, 100),
      return_url: i.returnUrl,
      notify_url: i.notifyUrl,
      pay_type: ['CARD', 'ATM', 'ACCT'],
      email: i.email,
    });
    if (!r.payment_url) throw new Error(`pchomepay create payment failed: ${r.error ?? r._status} ${r.error_message ?? ''}`);
    return { provider: 'pchomepay', kind: 'redirect', redirectUrl: r.payment_url, tradeNo: str(r.payment_id) || undefined };
  },

  async handle(cfg, body, ctx): Promise<NotifyOutcome> {
    // notify：notify_message 為 JSON 字串；return：query 帶 order_id
    let msg: Record<string, unknown> = {};
    if (typeof body.notify_message === 'string') {
      try {
        msg = JSON.parse(body.notify_message) as Record<string, unknown>;
      } catch {
        /* ignore */
      }
    }
    const no = str(msg.order_id ?? body.order_id ?? body.orderId);
    if (!no) return { verified: false, merchantOrderNo: null, reason: 'order_id missing' };
    const order = await ctx.getOrder(no);
    if (!order) return { verified: false, merchantOrderNo: no, reason: 'order not found' };
    const info = await api<PaymentInfo>(cfg, 'GET', `/v2/payment/${encodeURIComponent(no)}`);
    if (info.error || !info.status) return { verified: false, merchantOrderNo: no, reason: `query failed: ${info.error ?? info._status} ${info.error_message ?? ''}`.trim() };
    const tradeNo = str(info.payment_id) || undefined;
    const amount = info.amount !== undefined ? Number(info.amount) : undefined;
    const paymentType = str(info.pay_type) || undefined;
    const status = str(info.status).toUpperCase();
    if (status === 'S') return { verified: true, merchantOrderNo: no, kind: 'paid', tradeNo, amount, paymentType, paidAt: toDate(info.pay_time), raw: info };
    if (info.virt_account) return { verified: true, merchantOrderNo: no, kind: 'vacc_issued', tradeNo, amount, paymentType, virtualAccount: `${info.bank_code ? `(${info.bank_code}) ` : ''}${info.virt_account}`, expireAt: toExpire(info.expired_at), raw: info };
    if (status === 'F' || status === 'C') return { verified: true, merchantOrderNo: no, kind: 'failed', tradeNo, amount, paymentType, message: `status ${status}`, raw: info };
    return { verified: true, merchantOrderNo: no, kind: 'ignored', tradeNo, amount, message: `status ${status}`, raw: info };
  },

  async refund(cfg, order) {
    const r = await api<{ refund_id?: string; status?: string }>(cfg, 'POST', '/v2/refund', { order_id: order.merchantOrderNo, amount: order.amount, refund_id: `R${order.merchantOrderNo}`.slice(0, 20) }).catch((e) => ({ error: 'ERROR', error_message: String(e), _status: 0 }) as { error?: string; error_message?: string; _status: number; refund_id?: string; status?: string });
    const ok = !r.error && r._status < 400;
    return { ok, via: 'refund', message: ok ? `refund ${r.refund_id ?? ''} ${r.status ?? ''}`.trim() : `${r.error ?? r._status} ${r.error_message ?? ''}`.trim() };
  },
};

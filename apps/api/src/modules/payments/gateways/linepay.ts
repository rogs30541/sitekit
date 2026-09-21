import { createHmac, randomUUID } from 'node:crypto';
import { str, type Gateway, type GatewayConfig, type NotifyOutcome } from './types';

const host = (cfg: GatewayConfig) => (cfg.testMode ? 'https://sandbox-api-pay.line.me' : 'https://api-pay.line.me');

interface LineResp<T = Record<string, unknown>> {
  returnCode: string;
  returnMessage?: string;
  info?: T;
}

/** LINE Pay v3 簽章：base64(HMAC-SHA256(channelSecret, channelSecret + uri + body + nonce)) */
export async function linepayCall<T = Record<string, unknown>>(cfg: GatewayConfig, method: 'POST' | 'GET', uri: string, body?: unknown): Promise<LineResp<T>> {
  const nonce = randomUUID();
  const payload = method === 'POST' ? JSON.stringify(body ?? {}) : '';
  const sig = createHmac('sha256', cfg.hashKey).update(`${cfg.hashKey}${uri}${payload}${nonce}`).digest('base64');
  const res = await fetch(`${host(cfg)}${uri}`, {
    method,
    headers: { 'content-type': 'application/json', 'X-LINE-ChannelId': cfg.merchantId, 'X-LINE-Authorization-Nonce': nonce, 'X-LINE-Authorization': sig },
    body: method === 'POST' ? payload : undefined,
  });
  return (await res.json()) as LineResp<T>;
}

/**
 * LINE Pay v3：Request API 取得 paymentUrl 導向；使用者付款後導回 confirmUrl（GET，帶 transactionId／orderId），
 * 伺服器再呼叫 Confirm API 才算付款完成（授權寫入以 Confirm 成功為準；無獨立 Notify）。
 * 設定：merchantId＝Channel ID、hashKey＝Channel Secret。
 */
export const linepayGateway: Gateway = {
  id: 'linepay',
  label: 'LINE Pay',
  ack: (ok) => (ok ? 'OK' : 'IGNORED'),

  async checkout(cfg, i) {
    const r = await linepayCall<{ paymentUrl?: { web?: string; app?: string }; transactionId?: number | string }>(cfg, 'POST', '/v3/payments/request', {
      amount: Math.round(i.amount),
      currency: 'TWD',
      orderId: i.merchantOrderNo,
      packages: [{ id: 'pkg1', amount: Math.round(i.amount), name: '線上訂單', products: i.items.map((x) => ({ name: x.name.slice(0, 100), quantity: x.qty, price: x.unitPrice })) }],
      redirectUrls: { confirmUrl: i.returnUrl, cancelUrl: i.cancelUrl, confirmUrlType: 'CLIENT' },
    });
    if (r.returnCode !== '0000' || !r.info?.paymentUrl?.web) throw new Error(`LINE Pay request failed: ${r.returnCode} ${r.returnMessage ?? ''}`);
    return { provider: 'linepay', kind: 'redirect', redirectUrl: r.info.paymentUrl.web, tradeNo: str(r.info.transactionId) || undefined };
  },

  async handle(cfg, body, ctx): Promise<NotifyOutcome> {
    const transactionId = str(body.transactionId);
    const no = str(body.orderId);
    if (!no) return { verified: false, merchantOrderNo: null, reason: 'orderId missing' };
    const order = await ctx.getOrder(no);
    if (!order) return { verified: false, merchantOrderNo: no, reason: 'order not found' };
    if (order.status === 'paid') return { verified: true, merchantOrderNo: no, kind: 'ignored', message: 'already paid', raw: body };
    const txId = transactionId || order.providerTradeNo;
    if (!txId) return { verified: false, merchantOrderNo: no, reason: 'transactionId missing' };
    if (order.providerTradeNo && transactionId && order.providerTradeNo !== transactionId) return { verified: false, merchantOrderNo: no, reason: 'transactionId mismatch' };
    const r = await linepayCall<{ transactionId?: number | string; payInfo?: { method?: string }[] }>(cfg, 'POST', `/v3/payments/${txId}/confirm`, { amount: order.amount, currency: 'TWD' });
    if (r.returnCode === '0000') return { verified: true, merchantOrderNo: no, kind: 'paid', tradeNo: txId, amount: order.amount, paymentType: `LINEPAY:${r.info?.payInfo?.[0]?.method ?? ''}`.replace(/:$/, ''), paidAt: new Date(), raw: r };
    // 1172＝已 confirm 過（重複導回）→ 視為已付款；其餘視為失敗
    if (r.returnCode === '1172') return { verified: true, merchantOrderNo: no, kind: 'paid', tradeNo: txId, amount: order.amount, paymentType: 'LINEPAY', paidAt: new Date(), raw: r };
    return { verified: true, merchantOrderNo: no, kind: 'failed', tradeNo: txId, amount: order.amount, message: `${r.returnCode} ${r.returnMessage ?? ''}`.trim(), raw: r };
  },

  async refund(cfg, order) {
    if (!order.providerTradeNo) return { ok: false, via: 'none', message: 'missing LINE Pay transactionId' };
    const r = await linepayCall(cfg, 'POST', `/v3/payments/${order.providerTradeNo}/refund`, {}).catch((e) => ({ returnCode: 'ERROR', returnMessage: String(e) }));
    return { ok: r.returnCode === '0000', via: 'refund', message: `${r.returnCode} ${r.returnMessage ?? ''}`.trim() };
  },
};

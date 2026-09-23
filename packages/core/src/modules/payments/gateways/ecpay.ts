import { createHash } from 'node:crypto';
import { str, toDate, toExpire, type Gateway, type GatewayConfig, type NotifyOutcome } from './types';

const host = (cfg: GatewayConfig) => (cfg.testMode ? 'https://payment-stage.ecpay.com.tw' : 'https://payment.ecpay.com.tw');

/** 綠界 .NET 式 UrlEncode：空白→+、~ 與 ' 也要編碼，最後整串轉小寫。 */
export function ecpayUrlEncode(s: string) {
  return encodeURIComponent(s).replace(/%20/g, '+').replace(/~/g, '%7e').replace(/'/g, '%27').toLowerCase();
}

/** CheckMacValue：參數依鍵名 A→Z 排序、HashKey 前置＋HashIV 後置、UrlEncode 轉小寫、SHA256 轉大寫。 */
export function ecpayCheckMac(params: Record<string, string | number>, hashKey: string, hashIv: string) {
  const q = Object.keys(params)
    .filter((k) => k !== 'CheckMacValue')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en'))
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha256').update(ecpayUrlEncode(`HashKey=${hashKey}&${q}&HashIV=${hashIv}`)).digest('hex').toUpperCase();
}

const tradeDate = (d = new Date()) => {
  const t = new Date(d.getTime() + 8 * 3600_000); // 台北時間
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}/${p(t.getUTCMonth() + 1)}/${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
};

/**
 * 綠界全方位金流 AIO（Cashier/AioCheckOut/V5）：表單 POST；ReturnURL 為伺服器回呼（回 1|OK）、
 * OrderResultURL 為前景導回、PaymentInfoURL 為 ATM／超商取號通知（RtnCode 2／10100073）。
 */
export const ecpayGateway: Gateway = {
  id: 'ecpay',
  label: '綠界科技',
  ack: (ok) => (ok ? '1|OK' : '0|IGNORED'),

  async checkout(cfg, i) {
    const params: Record<string, string | number> = {
      MerchantID: cfg.merchantId,
      MerchantTradeNo: i.merchantOrderNo.slice(0, 20),
      MerchantTradeDate: tradeDate(),
      PaymentType: 'aio',
      TotalAmount: Math.round(i.amount),
      TradeDesc: '線上訂單',
      ItemName: i.items.map((x) => `${x.name} x${x.qty}`).join('#').slice(0, 400),
      ReturnURL: i.notifyUrl,
      OrderResultURL: i.returnUrl,
      PaymentInfoURL: i.notifyUrl,
      ClientBackURL: i.clientBackUrl,
      ChoosePayment: 'ALL',
      EncryptType: 1,
      NeedExtraPaidInfo: 'N',
      ExpireDate: 3,
    };
    params.CheckMacValue = ecpayCheckMac(params, cfg.hashKey, cfg.hashIv);
    return { provider: 'ecpay', kind: 'form', gatewayUrl: `${host(cfg)}/Cashier/AioCheckOut/V5`, fields: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) };
  },

  async handle(cfg, body): Promise<NotifyOutcome> {
    const params = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, str(v)]));
    const mac = str(params.CheckMacValue);
    if (!mac) return { verified: false, merchantOrderNo: null, reason: 'CheckMacValue missing' };
    if (ecpayCheckMac(params, cfg.hashKey, cfg.hashIv) !== mac.toUpperCase()) return { verified: false, merchantOrderNo: str(params.MerchantTradeNo) || null, reason: 'CheckMacValue mismatch' };
    if (str(params.MerchantID) !== cfg.merchantId) return { verified: false, merchantOrderNo: null, reason: 'MerchantID mismatch' };
    const no = str(params.MerchantTradeNo);
    if (!no) return { verified: false, merchantOrderNo: null, reason: 'MerchantTradeNo missing' };
    const rtn = str(params.RtnCode);
    const tradeNo = str(params.TradeNo) || undefined;
    const amount = params.TradeAmt ? Number(params.TradeAmt) : undefined;
    const paymentType = str(params.PaymentType) || undefined;
    if (rtn === '1') return { verified: true, merchantOrderNo: no, kind: 'paid', tradeNo, amount, paymentType, paidAt: toDate(params.PaymentDate), raw: params };
    // ATM 取號（2）／超商代碼取號（10100073）／超商條碼取號（10100073）：尚未付款，先記帳號
    if (rtn === '2' || rtn === '10100073') {
      const va = params.vAccount ? `(${params.BankCode}) ${params.vAccount}` : str(params.PaymentNo) || str(params.Barcode1);
      return { verified: true, merchantOrderNo: no, kind: 'vacc_issued', tradeNo, amount, paymentType, virtualAccount: va, expireAt: toExpire(params.ExpireDate), raw: params };
    }
    return { verified: true, merchantOrderNo: no, kind: 'failed', tradeNo, amount, paymentType, message: `${rtn} ${str(params.RtnMsg)}`.trim(), raw: params };
  },

  /** 信用卡：先 N（未關帳放棄），失敗再 R（已關帳退刷）。需綠界開通「信用卡請退款 API」。 */
  async refund(cfg, order) {
    if (!order.providerTradeNo) return { ok: false, via: 'none', message: 'missing ecpay TradeNo' };
    const post = async (action: 'N' | 'R') => {
      const params: Record<string, string | number> = { MerchantID: cfg.merchantId, MerchantTradeNo: order.merchantOrderNo.slice(0, 20), TradeNo: order.providerTradeNo!, Action: action, TotalAmount: order.amount };
      params.CheckMacValue = ecpayCheckMac(params, cfg.hashKey, cfg.hashIv);
      const res = await fetch(`${host(cfg)}/CreditDetail/DoAction`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))).toString() });
      const q = Object.fromEntries(new URLSearchParams(await res.text()));
      return { ok: q.RtnCode === '1', message: `${q.RtnCode ?? ''} ${q.RtnMsg ?? ''}`.trim() };
    };
    const n = await post('N').catch((e) => ({ ok: false, message: String(e) }));
    if (n.ok) return { ok: true, via: 'abandon', message: n.message };
    const r = await post('R').catch((e) => ({ ok: false, message: String(e) }));
    return { ok: r.ok, via: 'refund', message: r.ok ? r.message : `${n.message} / ${r.message}` };
  },
};

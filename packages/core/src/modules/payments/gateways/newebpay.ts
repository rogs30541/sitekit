import { aesDecrypt, aesEncrypt, sha256Upper, toQuery } from '../newebpay';
import { str, toDate, toExpire, type Gateway, type GatewayConfig, type NotifyOutcome } from './types';

const base = (cfg: GatewayConfig) => (cfg.gatewayUrl?.includes('//core.newebpay.com') || (!cfg.gatewayUrl && !cfg.testMode) ? 'https://core.newebpay.com' : 'https://ccore.newebpay.com');

interface NotifyResult {
  Status: string;
  Message?: string;
  Result?: Record<string, unknown>;
}

/** 藍新 MPG v2.3：TradeInfo AES-256-CBC＋TradeSha SHA256；回呼驗 TradeSha → 解密 → CheckCode → 金額。 */
export const newebpayGateway: Gateway = {
  id: 'newebpay',
  label: '藍新金流',
  ack: (ok) => (ok ? 'OK' : 'IGNORED'),

  async checkout(cfg, i) {
    const d = new Date(Date.now() + 3 * 86_400_000);
    const params: Record<string, string | number> = {
      MerchantID: cfg.merchantId,
      RespondType: 'JSON',
      TimeStamp: Math.floor(Date.now() / 1000).toString(),
      Version: '2.3',
      MerchantOrderNo: i.merchantOrderNo,
      Amt: Math.round(i.amount),
      ItemDesc: i.items.map((x) => x.name).join('、').slice(0, 50),
      Email: i.email,
      LoginType: 0,
      NotifyURL: i.notifyUrl,
      ReturnURL: i.returnUrl,
      ClientBackURL: i.clientBackUrl,
      CREDIT: 1,
      VACC: 1,
      ExpireDate: `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`,
    };
    const tradeInfo = aesEncrypt(toQuery(params), cfg.hashKey, cfg.hashIv);
    const tradeSha = sha256Upper(`HashKey=${cfg.hashKey}&${tradeInfo}&HashIV=${cfg.hashIv}`);
    return {
      provider: 'newebpay',
      kind: 'form',
      gatewayUrl: cfg.gatewayUrl || `${base(cfg)}/MPG/mpg_gateway`,
      fields: { MerchantID: cfg.merchantId, TradeInfo: tradeInfo, TradeSha: tradeSha, Version: '2.3' },
    };
  },

  async handle(cfg, body): Promise<NotifyOutcome> {
    const tradeInfo = str(body.TradeInfo);
    const tradeSha = str(body.TradeSha);
    if (!tradeInfo || !tradeSha) return { verified: false, merchantOrderNo: null, reason: 'missing TradeInfo/TradeSha' };
    if (sha256Upper(`HashKey=${cfg.hashKey}&${tradeInfo}&HashIV=${cfg.hashIv}`) !== tradeSha.toUpperCase()) return { verified: false, merchantOrderNo: null, reason: 'TradeSha mismatch' };
    let parsed: NotifyResult;
    try {
      parsed = JSON.parse(aesDecrypt(tradeInfo, cfg.hashKey, cfg.hashIv)) as NotifyResult;
    } catch {
      return { verified: false, merchantOrderNo: null, reason: 'TradeInfo decrypt failed' };
    }
    const r = parsed.Result ?? {};
    const no = str(r.MerchantOrderNo);
    if (!no) return { verified: false, merchantOrderNo: null, reason: 'MerchantOrderNo missing' };
    if (r.CheckCode) {
      const s = `HashIV=${cfg.hashIv}&Amt=${r.Amt}&MerchantID=${cfg.merchantId}&MerchantOrderNo=${r.MerchantOrderNo}&TradeNo=${r.TradeNo}&HashKey=${cfg.hashKey}`;
      if (sha256Upper(s) !== str(r.CheckCode).toUpperCase()) return { verified: false, merchantOrderNo: no, reason: 'CheckCode mismatch' };
    }
    const tradeNo = str(r.TradeNo) || undefined;
    const amount = r.Amt !== undefined ? Number(r.Amt) : undefined;
    if (parsed.Status !== 'SUCCESS') return { verified: true, merchantOrderNo: no, kind: 'failed', tradeNo, amount, message: `${parsed.Status} ${parsed.Message ?? ''}`.trim(), raw: parsed };
    if (r.PaymentType === 'VACC' && r.BankCode && r.CodeNo && !r.PayBankCode) {
      return { verified: true, merchantOrderNo: no, kind: 'vacc_issued', tradeNo, amount, paymentType: 'VACC', virtualAccount: `(${r.BankCode}) ${r.CodeNo}`, expireAt: toExpire(r.ExpireDate), raw: parsed };
    }
    return { verified: true, merchantOrderNo: no, kind: 'paid', tradeNo, amount, paymentType: str(r.PaymentType) || undefined, paidAt: toDate(r.PayTime), raw: parsed };
  },

  /** 信用卡退款：先 Cancel（未請款取消授權），失敗再 Close CloseType=2（已請款退款）。 */
  async refund(cfg, order) {
    const post = async (path: string, params: Record<string, string | number>) => {
      const postData = aesEncrypt(toQuery(params), cfg.hashKey, cfg.hashIv);
      const res = await fetch(`${base(cfg)}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ MerchantID_: cfg.merchantId, PostData_: postData }).toString(),
      });
      return (await res.json()) as { Status: string; Message?: string };
    };
    const common = { RespondType: 'JSON', TimeStamp: Math.floor(Date.now() / 1000).toString(), MerchantOrderNo: order.merchantOrderNo, Amt: order.amount, IndexType: 1 };
    const cancel = await post('/API/CreditCard/Cancel', { ...common, Version: '1.0', NotifyURL: '' }).catch((e) => ({ Status: 'ERROR', Message: String(e) }));
    if (cancel.Status === 'SUCCESS') return { ok: true, via: 'cancel', message: cancel.Message ?? '' };
    const close = await post('/API/CreditCard/Close', { ...common, Version: '1.1', CloseType: 2 }).catch((e) => ({ Status: 'ERROR', Message: String(e) }));
    if (close.Status === 'SUCCESS') return { ok: true, via: 'close', message: close.Message ?? '' };
    return { ok: false, via: 'close', message: `${cancel.Status} ${cancel.Message ?? ''} / ${close.Status} ${close.Message ?? ''}`.trim() };
  },
};

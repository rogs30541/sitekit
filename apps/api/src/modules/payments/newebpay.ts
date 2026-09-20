import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';

/** 藍新 MPG 加解密與驗章（移植自度哥 utils/newebpay.ts，行為不變）。 */
export function aesEncrypt(data: string, hashKey: string, hashIv: string): string {
  const cipher = createCipheriv('aes-256-cbc', hashKey, hashIv);
  return cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
}

export function aesDecrypt(encrypted: string, hashKey: string, hashIv: string): string {
  try {
    const d = createDecipheriv('aes-256-cbc', hashKey, hashIv);
    return d.update(encrypted, 'hex', 'utf8') + d.final('utf8');
  } catch {
    // 藍新 v2.3 回傳的 padding 需手動處理
    const d = createDecipheriv('aes-256-cbc', hashKey, hashIv);
    d.setAutoPadding(false);
    let out = d.update(encrypted, 'hex', 'utf8') + d.final('utf8');
    const padLen = out.charCodeAt(out.length - 1);
    if (padLen > 0 && padLen <= 32) out = out.slice(0, out.length - padLen);
    return out;
  }
}

export const sha256Upper = (s: string) => createHash('sha256').update(s).digest('hex').toUpperCase();

export const toQuery = (p: Record<string, string | number>) =>
  Object.entries(p)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

export interface MpgInput {
  merchantId: string;
  hashKey: string;
  hashIv: string;
  gatewayUrl: string;
  merchantOrderNo: string;
  amount: number;
  itemDesc: string;
  email: string;
  notifyUrl: string;
  returnUrl: string;
  clientBackUrl: string;
  credit?: boolean;
  vacc?: boolean;
  expireDays?: number;
}

/** 產生 MPG 表單欄位；前端以 POST form 自動送到 gatewayUrl。 */
export function buildMpgForm(i: MpgInput) {
  const params: Record<string, string | number> = {
    MerchantID: i.merchantId,
    RespondType: 'JSON',
    TimeStamp: Math.floor(Date.now() / 1000).toString(),
    Version: '2.3',
    MerchantOrderNo: i.merchantOrderNo,
    Amt: Math.round(i.amount),
    ItemDesc: i.itemDesc.slice(0, 50),
    Email: i.email,
    LoginType: 0,
    NotifyURL: i.notifyUrl,
    ReturnURL: i.returnUrl,
    ClientBackURL: i.clientBackUrl,
  };
  if (i.credit !== false) params.CREDIT = 1;
  if (i.vacc) {
    params.VACC = 1;
    const d = new Date(Date.now() + (i.expireDays ?? 3) * 86_400_000);
    params.ExpireDate = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }
  const tradeInfo = aesEncrypt(toQuery(params), i.hashKey, i.hashIv);
  const tradeSha = sha256Upper(`HashKey=${i.hashKey}&${tradeInfo}&HashIV=${i.hashIv}`);
  return { gatewayUrl: i.gatewayUrl, fields: { MerchantID: i.merchantId, TradeInfo: tradeInfo, TradeSha: tradeSha, Version: '2.3' } };
}

export interface NotifyResult {
  Status: string;
  Message?: string;
  Result?: {
    MerchantID?: string;
    Amt?: number;
    TradeNo?: string;
    MerchantOrderNo?: string;
    PaymentType?: string;
    PayTime?: string;
    BankCode?: string;
    CodeNo?: string;
    PayBankCode?: string;
    PayerAccount5Code?: string;
    ExpireDate?: string;
    CheckCode?: string;
    [k: string]: unknown;
  };
}

/** 驗章＋解密回呼；驗章失敗回 null。 */
export function parseNotify(tradeInfo: string, tradeSha: string, hashKey: string, hashIv: string): NotifyResult | null {
  if (!tradeInfo || !tradeSha) return null;
  if (sha256Upper(`HashKey=${hashKey}&${tradeInfo}&HashIV=${hashIv}`) !== tradeSha.toUpperCase()) return null;
  try {
    return JSON.parse(aesDecrypt(tradeInfo, hashKey, hashIv)) as NotifyResult;
  } catch {
    return null;
  }
}

/** Result.CheckCode 二次驗證（有帶才驗）。 */
export function verifyCheckCode(r: NonNullable<NotifyResult['Result']>, merchantId: string, hashKey: string, hashIv: string): boolean {
  if (!r.CheckCode) return true;
  const s = `HashIV=${hashIv}&Amt=${r.Amt}&MerchantID=${merchantId}&MerchantOrderNo=${r.MerchantOrderNo}&TradeNo=${r.TradeNo}&HashKey=${hashKey}`;
  return sha256Upper(s) === String(r.CheckCode).toUpperCase();
}

/** 信用卡退款：先 Cancel（未請款取消授權），失敗再 Close CloseType=2（已請款退款）。 */
export async function creditRefund(opts: { gatewayUrl: string; merchantId: string; hashKey: string; hashIv: string; merchantOrderNo: string; amount: number }) {
  const base = opts.gatewayUrl.includes('//core.newebpay.com') ? 'https://core.newebpay.com' : 'https://ccore.newebpay.com';
  const post = async (path: string, params: Record<string, string | number>) => {
    const postData = aesEncrypt(toQuery(params), opts.hashKey, opts.hashIv);
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ MerchantID_: opts.merchantId, PostData_: postData }).toString(),
    });
    return (await res.json()) as { Status: string; Message?: string; Result?: unknown };
  };
  const common = { RespondType: 'JSON', TimeStamp: Math.floor(Date.now() / 1000).toString(), MerchantOrderNo: opts.merchantOrderNo, Amt: opts.amount, IndexType: 1 };
  const cancel = await post('/API/CreditCard/Cancel', { ...common, Version: '1.0', NotifyURL: '' }).catch((e) => ({ Status: 'ERROR', Message: String(e) }));
  if (cancel.Status === 'SUCCESS') return { ok: true, via: 'cancel' as const, message: cancel.Message ?? '' };
  const close = await post('/API/CreditCard/Close', { ...common, Version: '1.1', CloseType: 2 }).catch((e) => ({ Status: 'ERROR', Message: String(e) }));
  if (close.Status === 'SUCCESS') return { ok: true, via: 'close' as const, message: close.Message ?? '' };
  return { ok: false, via: 'close' as const, message: `${cancel.Status} ${cancel.Message ?? ''} / ${close.Status} ${close.Message ?? ''}`.trim() };
}

import { createCipheriv, createDecipheriv } from 'node:crypto';

/** 綠界電子發票 B2C API（JSON）：Data＝AES-128-CBC( urlencode(JSON) ) base64；回應 Data 反向解。 */
export function ecpayInvoiceEncrypt(obj: unknown, hashKey: string, hashIv: string) {
  const plain = encodeURIComponent(JSON.stringify(obj));
  const c = createCipheriv('aes-128-cbc', Buffer.from(hashKey, 'utf8'), Buffer.from(hashIv, 'utf8'));
  return Buffer.concat([c.update(plain, 'utf8'), c.final()]).toString('base64');
}
export function ecpayInvoiceDecrypt<T = Record<string, unknown>>(data: string, hashKey: string, hashIv: string): T {
  const d = createDecipheriv('aes-128-cbc', Buffer.from(hashKey, 'utf8'), Buffer.from(hashIv, 'utf8'));
  const plain = Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  return JSON.parse(decodeURIComponent(plain)) as T;
}
export const ECPAY_INVOICE_HOST = (testMode: boolean) => (testMode ? 'https://einvoice-stage.ecpay.com.tw' : 'https://einvoice.ecpay.com.tw');

export async function ecpayInvoiceCall<T = Record<string, unknown>>(i: { merchantId: string; hashKey: string; hashIv: string; testMode: boolean; path: string; data: Record<string, unknown> }): Promise<{ ok: boolean; rtnCode: number; rtnMsg: string; data: T | null; raw: unknown }> {
  const body = { MerchantID: i.merchantId, RqHeader: { Timestamp: Math.floor(Date.now() / 1000) }, Data: ecpayInvoiceEncrypt({ MerchantID: i.merchantId, ...i.data }, i.hashKey, i.hashIv) };
  const res = await fetch(`${ECPAY_INVOICE_HOST(i.testMode)}${i.path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { TransCode?: number; TransMsg?: string; Data?: string };
  if (j.TransCode !== 1 || !j.Data) return { ok: false, rtnCode: j.TransCode ?? res.status, rtnMsg: j.TransMsg ?? `HTTP ${res.status}`, data: null, raw: j };
  let data: (T & { RtnCode?: number; RtnMsg?: string }) | null = null;
  try {
    data = ecpayInvoiceDecrypt(j.Data, i.hashKey, i.hashIv);
  } catch {
    return { ok: false, rtnCode: -1, rtnMsg: 'decrypt failed', data: null, raw: j };
  }
  return { ok: data?.RtnCode === 1, rtnCode: data?.RtnCode ?? -1, rtnMsg: data?.RtnMsg ?? '', data, raw: j };
}

import { aesDecrypt, aesEncrypt, sha256Upper, toQuery } from '../payments/newebpay';

/**
 * 藍新物流（物流服務技術串接手冊 NDNSv1.0.0）：店到店 C2C 超商取貨（7-ELEVEN／全家／萊爾富／OK）。
 * 所有 API：POST form 到 https://{c}core.newebpay.com/API/Logistic/<api>，參數 UID_（商店代號）、EncryptData_（AES，與 MPG 同一組 HashKey/HashIV）、
 * HashData_＝SHA256("HashKey=K&<EncryptData>&HashIV=V") 大寫、Version_ 1.0、RespondType_ JSON。
 * 注意：建立寄貨單需該商店訂單編號已有藍新金流交易（錯誤碼 1107 查無金流訂單）＝藍新超商取貨必須搭配藍新金流付款。
 */
export const NWP_HOST = (testMode: boolean) => (testMode ? 'https://ccore.newebpay.com' : 'https://core.newebpay.com');

/** 我方配送方式 id → 藍新 ShipType */
export const NWP_SHIP_TYPES: Record<string, string> = { NWP_UNIMART: '1', NWP_FAMILY: '2', NWP_HILIFE: '3', NWP_OK: '4' };
export const isNwp = (m: string) => m in NWP_SHIP_TYPES;

export interface NwpCfg {
  merchantId: string;
  hashKey: string;
  hashIv: string;
  testMode: boolean;
}

export function nwpEncrypt(cfg: NwpCfg, params: Record<string, string | number>) {
  const enc = aesEncrypt(toQuery(params), cfg.hashKey, cfg.hashIv);
  return { EncryptData_: enc, HashData_: sha256Upper(`HashKey=${cfg.hashKey}&${enc}&HashIV=${cfg.hashIv}`) };
}

/** 驗 HashData 並解密；內容可能是 JSON 或 query string */
export function nwpDecrypt(cfg: NwpCfg, encryptData: string, hashData: string): Record<string, unknown> | null {
  if (!encryptData || !hashData) return null;
  if (sha256Upper(`HashKey=${cfg.hashKey}&${encryptData}&HashIV=${cfg.hashIv}`) !== hashData.toUpperCase()) return null;
  let plain: string;
  try {
    plain = aesDecrypt(encryptData, cfg.hashKey, cfg.hashIv);
  } catch {
    return null;
  }
  try {
    return JSON.parse(plain) as Record<string, unknown>;
  } catch {
    return Object.fromEntries(new URLSearchParams(plain));
  }
}

export function nwpForm(cfg: NwpCfg, api: string, params: Record<string, string | number>) {
  return { gatewayUrl: `${NWP_HOST(cfg.testMode)}/API/Logistic/${api}`, fields: { UID_: cfg.merchantId, ...nwpEncrypt(cfg, params), Version_: '1.0', RespondType_: 'JSON' } };
}

/** 門市地圖（前景表單 POST；選完 POST 回 ReturnURL） */
export function buildNwpStoreMapForm(cfg: NwpCfg, i: { merchantOrderNo: string; method: string; returnUrl: string; extraData?: string }) {
  return nwpForm(cfg, 'storeMap', { MerchantOrderNo: i.merchantOrderNo.slice(0, 30), LgsType: 'C2C', ShipType: NWP_SHIP_TYPES[i.method], ReturnURL: i.returnUrl, TimeStamp: Math.floor(Date.now() / 1000), ExtraData: (i.extraData ?? '').slice(0, 20) });
}

export interface NwpResponse {
  Status: string;
  Message?: string;
  EncryptData?: string;
  HashData?: string;
  UID?: string;
  Version?: string;
}

/** 伺服器對伺服器呼叫（createShipment／getShipmentNo／queryShipment／trace／modifyShipment） */
export async function nwpCall(cfg: NwpCfg, api: string, params: Record<string, string | number>, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; status: string; message: string; data: Record<string, unknown> | null; raw: unknown }> {
  const form = nwpForm(cfg, api, params);
  const res = await fetchImpl(form.gatewayUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form.fields).toString(), signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let j: NwpResponse;
  try {
    j = JSON.parse(text) as NwpResponse;
  } catch {
    return { ok: false, status: `HTTP${res.status}`, message: text.slice(0, 200), data: null, raw: text.slice(0, 500) };
  }
  const data = j.EncryptData && j.HashData ? nwpDecrypt(cfg, j.EncryptData, j.HashData) : null;
  return { ok: j.Status === 'SUCCESS' && (!j.EncryptData || !!data), status: j.Status, message: j.Message ?? '', data, raw: j };
}

/** 貨態代碼（附錄二）→ 我方物流狀態 */
export function mapNwpRetId(retId: string): 'pending' | 'shipped' | 'delivered' | 'returned' | null {
  const r = String(retId ?? '').trim();
  if (['0_1', '0_2', '0_3', '1'].includes(r)) return 'pending';
  if (['2', '3', '4', '5', '11'].includes(r)) return 'shipped';
  if (r === '6') return 'delivered';
  if (r.startsWith('-') || ['10', '12', '13', '14', '15', '16'].includes(r)) return 'returned';
  return null;
}

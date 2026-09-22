import { createHash } from 'node:crypto';

/**
 * 光貿（Amego）電子發票加值中心 API（依 https://invoice.amego.tw/api_doc/ 基本說明）：
 * POST application/x-www-form-urlencoded 到 https://invoice-api.amego.tw/<path>，
 * 參數 invoice（統編）、data（JSON 字串）、time（unix 秒，±60s）、sign＝md5(data + time + AppKey)。
 * 測試與正式同一網址，用測試公司統編／App Key 即為測試。
 */
export const AMEGO_API = 'https://invoice-api.amego.tw';

export interface AmegoResponse {
  code: number;
  msg: string;
  invoice_number?: string;
  invoice_time?: number;
  random_number?: string;
  barcode?: string;
  [k: string]: unknown;
}

export function amegoSign(dataJson: string, time: number, appKey: string) {
  return createHash('md5').update(`${dataJson}${time}${appKey}`).digest('hex');
}

export async function amegoCall(i: { taxId: string; appKey: string; path: string; data: unknown; fetchImpl?: typeof fetch }): Promise<AmegoResponse> {
  const dataJson = JSON.stringify(i.data);
  const time = Math.floor(Date.now() / 1000);
  const body = new URLSearchParams({ invoice: i.taxId, data: dataJson, time: String(time), sign: amegoSign(dataJson, time, i.appKey) });
  const res = await (i.fetchImpl ?? fetch)(`${AMEGO_API}${i.path}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  try {
    return JSON.parse(text) as AmegoResponse;
  } catch {
    return { code: -1, msg: `HTTP ${res.status} ${text.slice(0, 200)}` };
  }
}

/** 光貿載具類別代碼 */
export const AMEGO_CARRIER = { mobile: '3J0002', citizen: 'CQ0001', member: 'amego' } as const;

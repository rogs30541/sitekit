import { createHash } from 'node:crypto';
import { ecpayUrlEncode } from '../payments/gateways/ecpay';

/** 綠界物流 CheckMacValue：與金流同一套排序／UrlEncode 規則，但用 MD5（大寫）。 */
export function logisticsCheckMac(params: Record<string, string | number>, hashKey: string, hashIv: string) {
  const q = Object.keys(params)
    .filter((k) => k !== 'CheckMacValue')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en'))
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('md5').update(ecpayUrlEncode(`HashKey=${hashKey}&${q}&HashIV=${hashIv}`)).digest('hex').toUpperCase();
}

export const LOGISTICS_HOST = (testMode: boolean) => (testMode ? 'https://logistics-stage.ecpay.com.tw' : 'https://logistics.ecpay.com.tw');

/** 超商 C2C 子類型 → 物流類型 */
export const CVS_SUBTYPES = ['UNIMARTC2C', 'FAMIC2C', 'HILIFEC2C', 'OKMARTC2C'] as const;
export const HOME_SUBTYPES = ['TCAT', 'ECAN'] as const;
export type EcpaySubType = (typeof CVS_SUBTYPES)[number] | (typeof HOME_SUBTYPES)[number];
export const isCvs = (m: string) => (CVS_SUBTYPES as readonly string[]).includes(m);
export const isHome = (m: string) => (HOME_SUBTYPES as readonly string[]).includes(m);
export const logisticsTypeOf = (m: string) => (isCvs(m) ? 'CVS' : 'HOME');

const tradeDate = (d = new Date()) => {
  const t = new Date(d.getTime() + 8 * 3600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}/${p(t.getUTCMonth() + 1)}/${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`;
};
const str = (p: Record<string, string | number>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]));

/** 電子地圖（選門市）：前端表單 POST；綠界選完 POST 回 ServerReplyURL。 */
export function buildMapForm(i: { merchantId: string; hashKey: string; hashIv: string; testMode: boolean; merchantTradeNo: string; subType: string; serverReplyUrl: string; extraData?: string }) {
  const params: Record<string, string | number> = { MerchantID: i.merchantId, MerchantTradeNo: i.merchantTradeNo.slice(0, 20), LogisticsType: 'CVS', LogisticsSubType: i.subType, IsCollection: 'N', ServerReplyURL: i.serverReplyUrl, ExtraData: (i.extraData ?? '').slice(0, 20), Device: 0 };
  return { gatewayUrl: `${LOGISTICS_HOST(i.testMode)}/Express/map`, fields: str(params) };
}

export interface CreateInput {
  merchantId: string;
  hashKey: string;
  hashIv: string;
  testMode: boolean;
  merchantTradeNo: string;
  subType: string;
  goodsAmount: number;
  goodsName: string;
  sender: { name: string; phone: string; zip?: string; address?: string };
  receiver: { name: string; phone: string; email?: string; zip?: string; address?: string; storeId?: string };
  serverReplyUrl: string;
  isCollection?: boolean;
}

/** 建立物流訂單（伺服器對伺服器 POST /Express/Create）；回傳 "1|k=v&k=v" 或 "0|錯誤"。 */
export function buildCreateParams(i: CreateInput) {
  const cvs = isCvs(i.subType);
  const params: Record<string, string | number> = {
    MerchantID: i.merchantId,
    MerchantTradeNo: i.merchantTradeNo.slice(0, 20),
    MerchantTradeDate: tradeDate(),
    LogisticsType: cvs ? 'CVS' : 'HOME',
    LogisticsSubType: i.subType,
    GoodsAmount: Math.max(1, Math.round(i.goodsAmount)),
    GoodsName: i.goodsName.replace(/[\^'`!@#%&*+\\"<>|_[\]]/g, '').slice(0, cvs ? 25 : 60) || '商品',
    SenderName: i.sender.name.slice(0, 10),
    SenderCellPhone: i.sender.phone.replace(/\D/g, '').slice(0, 10),
    ReceiverName: i.receiver.name.slice(0, 10),
    ReceiverCellPhone: i.receiver.phone.replace(/\D/g, '').slice(0, 10),
    ServerReplyURL: i.serverReplyUrl,
    IsCollection: i.isCollection ? 'Y' : 'N',
  };
  if (i.receiver.email) params.ReceiverEmail = i.receiver.email;
  if (cvs) params.ReceiverStoreID = i.receiver.storeId ?? '';
  else {
    params.SenderZipCode = i.sender.zip ?? '';
    params.SenderAddress = i.sender.address ?? '';
    params.ReceiverZipCode = i.receiver.zip ?? '';
    params.ReceiverAddress = i.receiver.address ?? '';
    params.Temperature = '0001';
    params.Distance = '00';
    params.Specification = '0001';
  }
  params.CheckMacValue = logisticsCheckMac(params, i.hashKey, i.hashIv);
  return { url: `${LOGISTICS_HOST(i.testMode)}/Express/Create`, params: str(params) };
}

export function parseCreateResponse(text: string): { ok: boolean; data: Record<string, string>; message: string } {
  const [code, rest = ''] = text.split('|');
  const data = Object.fromEntries(new URLSearchParams(rest));
  return { ok: code.trim() === '1', data, message: code.trim() === '1' ? '' : rest };
}

/** 列印託運單／寄貨單：後台以表單 POST 開新視窗 */
export function buildPrintForm(i: { merchantId: string; hashKey: string; hashIv: string; testMode: boolean; subType: string; logisticsId: string; paymentNo?: string; validationNo?: string }) {
  const path = i.subType === 'UNIMARTC2C' ? '/Express/PrintUniMartC2COrderInfo' : i.subType === 'FAMIC2C' ? '/Express/PrintFAMIC2COrderInfo' : i.subType === 'HILIFEC2C' ? '/Express/PrintHILIFEC2COrderInfo' : i.subType === 'OKMARTC2C' ? '/Express/PrintOKMARTC2COrderInfo' : '/helper/printTradeDocument';
  const params: Record<string, string | number> = { MerchantID: i.merchantId, AllPayLogisticsID: i.logisticsId };
  if (i.subType === 'UNIMARTC2C' || i.subType === 'FAMIC2C' || i.subType === 'HILIFEC2C' || i.subType === 'OKMARTC2C') {
    params.CVSPaymentNo = i.paymentNo ?? '';
    if (i.subType === 'UNIMARTC2C') params.CVSValidationNo = i.validationNo ?? '';
  }
  params.CheckMacValue = logisticsCheckMac(params, i.hashKey, i.hashIv);
  return { gatewayUrl: `${LOGISTICS_HOST(i.testMode)}${path}`, fields: str(params) };
}

/** 綠界物流狀態碼（常用）→ 我方物流狀態 */
export function mapRtnCode(code: string): 'pending' | 'shipped' | 'delivered' | 'returned' | null {
  const c = Number(code);
  if ([300, 310, 2001, 2030, 2063, 3001, 3006, 3012].includes(c)) return 'pending'; // 建立／已列印／出貨中
  if ([2068, 2073, 3018, 3024, 3029, 3032, 3101, 3102, 3103, 3117].includes(c)) return 'shipped'; // 已交寄／運送中／到店
  if ([2067, 3022, 3031, 3118].includes(c)) return 'delivered'; // 已取件／已送達
  if ([2072, 2074, 3020, 3023, 3033, 3035, 3036, 3038].includes(c)) return 'returned'; // 逾期退回
  return null;
}

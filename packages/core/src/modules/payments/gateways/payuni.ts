import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { formUrlencoded, str, toDate, toExpire, type Gateway, type GatewayConfig, type NotifyOutcome } from './types';

const host = (cfg: GatewayConfig) => (cfg.testMode ? 'https://sandbox-api.payuni.com.tw' : 'https://api.payuni.com.tw');

/** 統一金流 AES-256-GCM：hex(密文 + ':::' + base64(tag))；HashInfo = SHA256(HashKey + EncryptInfo + HashIV) 大寫。 */
export function payuniEncrypt(plain: string, hashKey: string, hashIv: string) {
  const c = createCipheriv('aes-256-gcm', Buffer.from(hashKey, 'utf8'), Buffer.from(hashIv, 'utf8'));
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([enc, Buffer.from(':::'), Buffer.from(c.getAuthTag().toString('base64'))]).toString('hex');
}
export function payuniDecrypt(encrypted: string, hashKey: string, hashIv: string) {
  const buf = Buffer.from(encrypted, 'hex');
  const idx = buf.indexOf(':::');
  if (idx < 0) throw new Error('bad EncryptInfo');
  const d = createDecipheriv('aes-256-gcm', Buffer.from(hashKey, 'utf8'), Buffer.from(hashIv, 'utf8'));
  d.setAuthTag(Buffer.from(buf.subarray(idx + 3).toString('utf8'), 'base64'));
  return Buffer.concat([d.update(buf.subarray(0, idx)), d.final()]).toString('utf8');
}
export const payuniHash = (encryptInfo: string, hashKey: string, hashIv: string) => createHash('sha256').update(`${hashKey}${encryptInfo}${hashIv}`).digest('hex').toUpperCase();

/**
 * 統一金流 PAYUNi UPP 整合式支付頁（/api/upp）：表單 POST MerID／Version／EncryptInfo／HashInfo；
 * NotifyURL／ReturnURL 回同結構，驗 HashInfo → 解密 → 讀 TradeStatus（1 已付款、0 未付款＝取號）。
 */
export const payuniGateway: Gateway = {
  id: 'payuni',
  label: '統一金流 PAYUNi',
  ack: (ok) => (ok ? 'SUCCESS' : 'IGNORED'),

  async checkout(cfg, i) {
    const d = new Date(Date.now() + 3 * 86_400_000 + 8 * 3600_000);
    const info: Record<string, string | number> = {
      MerID: cfg.merchantId,
      MerTradeNo: i.merchantOrderNo,
      TradeAmt: Math.round(i.amount),
      Timestamp: Math.floor(Date.now() / 1000),
      ProdDesc: i.items.map((x) => x.name).join('、').slice(0, 100),
      UsrMail: i.email,
      ReturnURL: i.returnUrl,
      NotifyURL: i.notifyUrl,
      BackURL: i.clientBackUrl,
      ExpireDate: d.toISOString().slice(0, 10),
      Credit: 1,
      ATM: 1,
    };
    const encryptInfo = payuniEncrypt(formUrlencoded(info), cfg.hashKey, cfg.hashIv);
    return { provider: 'payuni', kind: 'form', gatewayUrl: `${host(cfg)}/api/upp`, fields: { MerID: cfg.merchantId, Version: '1.0', EncryptInfo: encryptInfo, HashInfo: payuniHash(encryptInfo, cfg.hashKey, cfg.hashIv) } };
  },

  async handle(cfg, body): Promise<NotifyOutcome> {
    const encryptInfo = str(body.EncryptInfo);
    const hashInfo = str(body.HashInfo);
    if (!encryptInfo || !hashInfo) return { verified: false, merchantOrderNo: null, reason: 'EncryptInfo/HashInfo missing' };
    if (payuniHash(encryptInfo, cfg.hashKey, cfg.hashIv) !== hashInfo.toUpperCase()) return { verified: false, merchantOrderNo: null, reason: 'HashInfo mismatch' };
    let r: Record<string, string>;
    try {
      r = Object.fromEntries(new URLSearchParams(payuniDecrypt(encryptInfo, cfg.hashKey, cfg.hashIv)));
    } catch {
      return { verified: false, merchantOrderNo: null, reason: 'EncryptInfo decrypt failed' };
    }
    const no = str(r.MerTradeNo);
    if (!no) return { verified: false, merchantOrderNo: null, reason: 'MerTradeNo missing' };
    if (r.MerID && r.MerID !== cfg.merchantId) return { verified: false, merchantOrderNo: no, reason: 'MerID mismatch' };
    const tradeNo = str(r.TradeNo) || undefined;
    const amount = r.TradeAmt ? Number(r.TradeAmt) : undefined;
    const paymentType = ({ '1': 'CREDIT', '2': 'ATM', '3': 'CVS', '5': 'AFTEE', '7': 'ICASH', '8': 'LINEPAY' } as Record<string, string>)[str(r.PaymentType)] ?? (str(r.PaymentType) || undefined);
    if (str(body.Status ?? r.Status) !== 'SUCCESS') return { verified: true, merchantOrderNo: no, kind: 'failed', tradeNo, amount, paymentType, message: `${str(r.Status)} ${str(r.Message)}`.trim(), raw: r };
    if (str(r.TradeStatus) === '1') return { verified: true, merchantOrderNo: no, kind: 'paid', tradeNo, amount, paymentType, paidAt: toDate(r.PayTime), raw: r };
    if (r.PayNo || r.BankType) return { verified: true, merchantOrderNo: no, kind: 'vacc_issued', tradeNo, amount, paymentType, virtualAccount: `${r.BankType ? `(${r.BankType}) ` : ''}${str(r.PayNo)}`, expireAt: toExpire(r.ExpireDate), raw: r };
    if (str(r.TradeStatus) === '0') return { verified: true, merchantOrderNo: no, kind: 'ignored', tradeNo, amount, message: 'unpaid', raw: r };
    return { verified: true, merchantOrderNo: no, kind: 'failed', tradeNo, amount, paymentType, message: `TradeStatus ${str(r.TradeStatus)} ${str(r.Message)}`.trim(), raw: r };
  },

  /** 信用卡：先取消授權（/api/trade/cancel），失敗再退款（/api/trade/close CloseType=2）。 */
  async refund(cfg, order) {
    if (!order.providerTradeNo) return { ok: false, via: 'none', message: 'missing payuni TradeNo' };
    const post = async (path: string, extra: Record<string, string | number>) => {
      const info = formUrlencoded({ MerID: cfg.merchantId, TradeNo: order.providerTradeNo!, Timestamp: Math.floor(Date.now() / 1000), ...extra });
      const encryptInfo = payuniEncrypt(info, cfg.hashKey, cfg.hashIv);
      const res = await fetch(`${host(cfg)}${path}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: formUrlencoded({ MerID: cfg.merchantId, Version: '1.0', EncryptInfo: encryptInfo, HashInfo: payuniHash(encryptInfo, cfg.hashKey, cfg.hashIv) }) });
      const j = (await res.json().catch(() => ({}))) as { Status?: string; Message?: string; EncryptInfo?: string };
      let msg = j.Message ?? '';
      if (j.EncryptInfo) {
        try {
          msg = str(Object.fromEntries(new URLSearchParams(payuniDecrypt(j.EncryptInfo, cfg.hashKey, cfg.hashIv))).Message) || msg;
        } catch {
          /* keep */
        }
      }
      return { ok: j.Status === 'SUCCESS', message: `${j.Status ?? res.status} ${msg}`.trim() };
    };
    const cancel = await post('/api/trade/cancel', {}).catch((e) => ({ ok: false, message: String(e) }));
    if (cancel.ok) return { ok: true, via: 'cancel', message: cancel.message };
    const close = await post('/api/trade/close', { CloseType: 2, TradeAmt: order.amount }).catch((e) => ({ ok: false, message: String(e) }));
    return { ok: close.ok, via: 'close', message: close.ok ? close.message : `${cancel.message} / ${close.message}` };
  },
};

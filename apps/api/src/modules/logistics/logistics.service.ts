import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { LOGISTICS_METHOD_LABELS, SETTING_KEYS } from '@sitekit/shared';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifyService } from '../notify/notify.service';
import { SettingsService } from '../settings/settings.service';
import { buildCreateParams, buildMapForm, buildPrintForm, isCvs, logisticsCheckMac, mapRtnCode, parseCreateResponse } from './ecpay-logistics';
import { buildNwpStoreMapForm, isNwp, mapNwpRetId, nwpCall, nwpDecrypt, nwpForm, NWP_SHIP_TYPES, type NwpCfg } from './newebpay-logistics';

export interface LogisticsMethod {
  id: string;
  label: string;
  fee: number;
  kind: 'cvs' | 'home' | 'manual';
  provider: 'ecpay' | 'newebpay' | 'manual';
}

/**
 * 物流：綠界物流（超商取貨 C2C 四家＋宅配黑貓／宅配通）＋「自行配送」。
 * 運費規則：每個方式一個運費（logistics.fee.<method>），滿 shipping.freeOver 免運；未設定物流商時只有自行配送（shipping.fee）。
 */
@Injectable()
export class LogisticsService {
  private readonly log = new Logger(LogisticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifier: NotifyService,
  ) {}

  async config() {
    const g = (k: string, e?: string, d = '') => this.settings.get(k, e, d);
    const [provider, merchantId, hashKey, hashIv, test, methodsRaw, senderName, senderPhone, senderZip, senderAddress, fee, freeOver, feesRaw] = await Promise.all([
      g(SETTING_KEYS.logisticsProvider, 'LOGISTICS_PROVIDER', 'none'),
      g(SETTING_KEYS.ecpayLogisticsMerchantId, 'ECPAY_LOGISTICS_MERCHANT_ID'),
      g(SETTING_KEYS.ecpayLogisticsHashKey, 'ECPAY_LOGISTICS_HASH_KEY'),
      g(SETTING_KEYS.ecpayLogisticsHashIv, 'ECPAY_LOGISTICS_HASH_IV'),
      g(SETTING_KEYS.ecpayLogisticsTestMode, 'ECPAY_LOGISTICS_TEST_MODE', 'true'),
      g(SETTING_KEYS.logisticsMethods, 'LOGISTICS_METHODS', 'manual'),
      g(SETTING_KEYS.logisticsSenderName, 'LOGISTICS_SENDER_NAME'),
      g(SETTING_KEYS.logisticsSenderPhone, 'LOGISTICS_SENDER_PHONE'),
      g(SETTING_KEYS.logisticsSenderZip, 'LOGISTICS_SENDER_ZIP'),
      g(SETTING_KEYS.logisticsSenderAddress, 'LOGISTICS_SENDER_ADDRESS'),
      g(SETTING_KEYS.shippingFee, 'SHIPPING_FEE', '0'),
      g(SETTING_KEYS.shippingFreeOver, 'SHIPPING_FREE_OVER', ''),
      g(SETTING_KEYS.logisticsFees, 'LOGISTICS_FEES', ''),
    ]);
    const fees: Record<string, number> = {};
    for (const part of feesRaw.split(',')) {
      const [k, v] = part.split('=').map((s) => s.trim());
      if (k && v !== undefined && Number.isFinite(Number(v))) fees[k] = Number(v);
    }
    const useEcpay = provider === 'ecpay' || provider === 'both';
    const useNwp = provider === 'newebpay' || provider === 'both';
    const ecpayReady = useEcpay && !!(merchantId && hashKey && hashIv);
    // 藍新物流沿用藍新金流商店參數（同一組 MerchantID／HashKey／HashIV）
    const np = await this.settings.gateway('newebpay');
    const nwp: NwpCfg & { ready: boolean } = { merchantId: np.merchantId, hashKey: np.hashKey, hashIv: np.hashIv, testMode: np.testMode, ready: useNwp && np.configured };
    const methods = methodsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    return { provider, ecpayReady, nwp, merchantId, hashKey, hashIv, testMode: test !== 'false', methods, sender: { name: senderName, phone: senderPhone, zip: senderZip, address: senderAddress }, manualFee: Number(fee) || 0, freeOver: freeOver ? Number(freeOver) : null, fees };
  }

  /** 結帳可選配送方式：只列已啟用且（綠界方式）物流商已設定者 */
  async methods(): Promise<LogisticsMethod[]> {
    const c = await this.config();
    const out: LogisticsMethod[] = [];
    for (const id of c.methods) {
      if (id === 'manual') out.push({ id, label: LOGISTICS_METHOD_LABELS.manual, fee: c.fees.manual ?? c.manualFee, kind: 'manual', provider: 'manual' });
      else if (isNwp(id) && c.nwp.ready) out.push({ id, label: LOGISTICS_METHOD_LABELS[id as keyof typeof LOGISTICS_METHOD_LABELS], fee: c.fees[id] ?? c.manualFee, kind: 'cvs', provider: 'newebpay' });
      else if (id in LOGISTICS_METHOD_LABELS && !isNwp(id) && c.ecpayReady) out.push({ id, label: LOGISTICS_METHOD_LABELS[id as keyof typeof LOGISTICS_METHOD_LABELS], fee: c.fees[id] ?? c.manualFee, kind: isCvs(id) ? 'cvs' : 'home', provider: 'ecpay' });
    }
    if (!out.length) out.push({ id: 'manual', label: LOGISTICS_METHOD_LABELS.manual, fee: c.manualFee, kind: 'manual', provider: 'manual' });
    return out;
  }

  /** 依方式算運費（滿額免運） */
  async feeFor(methodId: string | undefined, subtotalAfterDiscount: number) {
    const [list, c] = await Promise.all([this.methods(), this.config()]);
    const m = list.find((x) => x.id === methodId) ?? list[0];
    const free = c.freeOver !== null && subtotalAfterDiscount >= c.freeOver;
    return { method: m, fee: free ? 0 : m.fee };
  }

  // ---- 電子地圖（選門市）----
  private storeSig(payload: string) {
    return createHmac('sha256', env.SESSION_SECRET).update(`cvs:${payload}`).digest('base64url');
  }

  async mapForm(subType: string, userId: string) {
    const c = await this.config();
    const site = await this.settings.siteUrl();
    if (isNwp(subType)) {
      if (!c.nwp.ready || !c.methods.includes(subType)) throw new BadRequestException('此取貨方式未啟用');
      return buildNwpStoreMapForm(c.nwp, { merchantOrderNo: `MAP${Date.now().toString(36).toUpperCase()}`, method: subType, returnUrl: `${site}/api/logistics/newebpay/map-reply`, extraData: userId.slice(0, 20) });
    }
    if (!c.ecpayReady || !isCvs(subType) || !c.methods.includes(subType)) throw new BadRequestException('此取貨方式未啟用');
    return buildMapForm({ merchantId: c.merchantId, hashKey: c.hashKey, hashIv: c.hashIv, testMode: c.testMode, merchantTradeNo: `MAP${Date.now().toString(36).toUpperCase()}`, subType, serverReplyUrl: `${site}/api/logistics/ecpay/map-reply`, extraData: userId.slice(0, 20) });
  }

  /** 綠界選完門市 POST 回來：把門市資訊簽章後放進導回網址（不落地、不需登入） */
  async mapReply(body: Record<string, unknown>) {
    const site = await this.settings.siteUrl();
    const store = { subType: String(body.LogisticsSubType ?? ''), id: String(body.CVSStoreID ?? ''), name: String(body.CVSStoreName ?? ''), address: String(body.CVSAddress ?? ''), tel: String(body.CVSTelephone ?? '') };
    if (!store.id) return `${site}/cart?cvs=error`;
    const payload = Buffer.from(JSON.stringify(store)).toString('base64url');
    return `${site}/cart?cvs=${payload}.${this.storeSig(payload)}`;
  }

  /** 藍新門市地圖 POST 回來：驗 HashData → 解密 → 同一套簽章 token 導回購物車 */
  async nwpMapReply(body: Record<string, unknown>) {
    const c = await this.config();
    const site = await this.settings.siteUrl();
    const d = nwpDecrypt(c.nwp, String(body.EncryptData ?? ''), String(body.HashData ?? ''));
    if (!d || String(body.Status ?? 'SUCCESS') !== 'SUCCESS') return `${site}/cart?cvs=error`;
    const method = Object.entries(NWP_SHIP_TYPES).find(([, v]) => v === String(d.ShipType))?.[0] ?? '';
    const store = { subType: method, id: String(d.StoreID ?? ''), name: String(d.StoreName ?? ''), address: String(d.StoreAddr ?? ''), tel: String(d.StoreTel ?? '') };
    if (!store.id || !method) return `${site}/cart?cvs=error`;
    const payload = Buffer.from(JSON.stringify(store)).toString('base64url');
    return `${site}/cart?cvs=${payload}.${this.storeSig(payload)}`;
  }

  /** 前端把 token 送回來驗章解出門市（也在建單時再驗一次） */
  verifyStoreToken(token: string) {
    const [payload, sig] = String(token ?? '').split('.');
    if (!payload || !sig) return null;
    const expect = this.storeSig(payload);
    if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    try {
      return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { subType: string; id: string; name: string; address: string; tel: string };
    } catch {
      return null;
    }
  }

  // ---- 物流訂單 ----
  async createOrder(orderIdOrNo: string, actor: string) {
    const c = await this.config();
    const order = await this.prisma.order.findFirst({ where: { OR: [{ id: orderIdOrNo }, { merchantOrderNo: orderIdOrNo }] }, include: { items: true, user: { select: { email: true } } } });
    if (!order) throw new BadRequestException('order not found');
    if (order.status !== 'paid') throw new BadRequestException('只有已付款訂單能建立物流單');
    if (!order.shippingMethod || order.shippingMethod === 'manual') throw new BadRequestException('此訂單為自行配送，不需建立物流單');
    if (order.logisticsId) return { merchantOrderNo: order.merchantOrderNo, logisticsId: order.logisticsId, paymentNo: order.logisticsPaymentNo, validationNo: order.logisticsValidationNo, already: true };
    if (isNwp(order.shippingMethod)) return this.createNwpShipment(order, c.nwp, actor);
    if (!c.ecpayReady) throw new BadRequestException('綠界物流未設定');
    if (!c.sender.name || !c.sender.phone) throw new BadRequestException('請先在物流設定填寄件人名稱與電話');
    const site = await this.settings.siteUrl();
    const { url, params } = buildCreateParams({
      merchantId: c.merchantId,
      hashKey: c.hashKey,
      hashIv: c.hashIv,
      testMode: c.testMode,
      merchantTradeNo: order.merchantOrderNo,
      subType: order.shippingMethod,
      goodsAmount: order.amount,
      goodsName: order.items.map((i) => i.name).join(' '),
      sender: c.sender,
      receiver: { name: order.shippingName ?? '', phone: order.shippingPhone ?? '', email: order.user.email, address: order.shippingAddress ?? '', storeId: order.cvsStoreId ?? undefined },
      serverReplyUrl: `${site}/api/logistics/ecpay/notify`,
    });
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
    const text = await res.text();
    const r = parseCreateResponse(text);
    await this.prisma.paymentEvent.create({ data: { orderId: order.id, provider: 'ecpay-logistics', type: r.ok ? 'logistics_created' : 'logistics_failed', tradeNo: r.data.AllPayLogisticsID ?? null, payload: { actor, raw: text.slice(0, 2000) } as Prisma.InputJsonValue } });
    if (!r.ok) throw new BadRequestException(`綠界物流建立失敗：${r.message.slice(0, 200)}`);
    const u = await this.prisma.order.update({ where: { id: order.id }, data: { logisticsId: r.data.AllPayLogisticsID ?? null, logisticsPaymentNo: r.data.CVSPaymentNo ?? null, logisticsValidationNo: r.data.CVSValidationNo ?? null, logisticsStatus: r.data.RtnCode ?? null, carrier: LOGISTICS_METHOD_LABELS[order.shippingMethod as keyof typeof LOGISTICS_METHOD_LABELS] ?? order.shippingMethod, trackingNo: r.data.CVSPaymentNo ?? r.data.AllPayLogisticsID ?? null } });
    return { merchantOrderNo: u.merchantOrderNo, logisticsId: u.logisticsId, paymentNo: u.logisticsPaymentNo, validationNo: u.logisticsValidationNo, rtnMsg: r.data.RtnMsg ?? '' };
  }

  /** 藍新：建立寄貨單（TradeType 3 取貨不付款；需同訂單編號已有藍新金流交易）→ 取得寄件代碼 */
  private async createNwpShipment(order: { id: string; merchantOrderNo: string; amount: number; provider: string | null; shippingMethod: string | null; shippingName: string | null; shippingPhone: string | null; cvsStoreId: string | null; items: { name: string }[]; user: { email: string } }, nwp: NwpCfg & { ready: boolean }, actor: string) {
    if (!nwp.ready) throw new BadRequestException('藍新物流未設定（沿用藍新金流商店參數）');
    if (order.provider !== 'newebpay') throw new BadRequestException('藍新超商取貨的訂單必須以藍新金流付款才能建立寄貨單');
    if (!order.cvsStoreId) throw new BadRequestException('訂單沒有取貨門市');
    const site = await this.settings.siteUrl();
    const ship = await nwpCall(nwp, 'createShipment', {
      MerchantOrderNo: order.merchantOrderNo.slice(0, 30),
      TradeType: 3,
      UserName: (order.shippingName ?? '').slice(0, 20),
      UserTel: (order.shippingPhone ?? '').replace(/\D/g, '').slice(0, 10),
      UserEmail: order.user.email.slice(0, 50),
      StoreID: order.cvsStoreId,
      Amt: order.amount,
      NotifyURL: `${site}/api/logistics/newebpay/notify`,
      ItemDesc: order.items.map((i) => i.name).join(' ').slice(0, 100),
      LgsType: 'C2C',
      ShipType: NWP_SHIP_TYPES[order.shippingMethod ?? ''] ?? '1',
      TimeStamp: Math.floor(Date.now() / 1000),
    });
    await this.prisma.paymentEvent.create({ data: { orderId: order.id, provider: 'newebpay-logistics', type: ship.ok ? 'logistics_created' : 'logistics_failed', tradeNo: ship.data?.TradeNo ? String(ship.data.TradeNo) : null, payload: { actor, status: ship.status, message: ship.message, data: ship.data } as Prisma.InputJsonValue } });
    if (!ship.ok) throw new BadRequestException(`藍新物流建立失敗：${ship.status} ${ship.message}`.trim());
    const no = await nwpCall(nwp, 'getShipmentNo', { MerchantOrderNo: JSON.stringify([order.merchantOrderNo.slice(0, 30)]), TimeStamp: Math.floor(Date.now() / 1000) });
    const okList = (no.data?.SUCCESS as Record<string, unknown>[] | undefined) ?? [];
    const hit = okList.find((x) => String(x.MerchantOrderNo) === order.merchantOrderNo) ?? okList[0];
    const lgsNo = hit?.LgsNo ? String(hit.LgsNo) : null;
    const printNo = hit?.StorePrintNo ? String(hit.StorePrintNo) : null;
    const u = await this.prisma.order.update({ where: { id: order.id }, data: { logisticsId: ship.data?.TradeNo ? String(ship.data.TradeNo) : order.merchantOrderNo, logisticsPaymentNo: lgsNo, logisticsValidationNo: printNo, logisticsStatus: '1', carrier: LOGISTICS_METHOD_LABELS[order.shippingMethod as keyof typeof LOGISTICS_METHOD_LABELS] ?? '藍新物流', trackingNo: lgsNo } });
    return { merchantOrderNo: u.merchantOrderNo, logisticsId: u.logisticsId, paymentNo: u.logisticsPaymentNo, validationNo: u.logisticsValidationNo, rtnMsg: no.ok ? '' : `寄件代碼：${no.status} ${no.message}` };
  }

  /** 藍新貨態即時通知（NPA-B58） */
  async nwpNotify(body: Record<string, unknown>) {
    const c = await this.config();
    const d = nwpDecrypt(c.nwp, String(body.EncryptData_ ?? body.EncryptData ?? ''), String(body.HashData_ ?? body.HashData ?? ''));
    if (!d) {
      this.log.warn('newebpay logistics notify: HashData mismatch');
      return 'FAIL';
    }
    const order = await this.prisma.order.findFirst({ where: { merchantOrderNo: String(d.MerchantOrderNo ?? '') } });
    if (!order) return 'FAIL';
    const mapped = mapNwpRetId(String(d.RetId ?? d.Retld ?? ''));
    await this.prisma.paymentEvent.create({ data: { orderId: order.id, provider: 'newebpay-logistics', type: `logistics_${String(d.RetId ?? d.Retld ?? 'unknown')}`, tradeNo: d.LgsNo ? String(d.LgsNo) : null, payload: d as Prisma.InputJsonValue } });
    await this.prisma.order.update({ where: { id: order.id }, data: { logisticsStatus: String(d.RetId ?? d.Retld ?? ''), ...(d.LgsNo ? { logisticsPaymentNo: String(d.LgsNo), trackingNo: String(d.LgsNo) } : {}), ...(mapped && mapped !== order.shippingStatus ? { shippingStatus: mapped, ...(mapped === 'shipped' && !order.shippedAt ? { shippedAt: new Date() } : {}) } : {}) } });
    if (mapped && mapped !== order.shippingStatus && (mapped === 'shipped' || mapped === 'delivered')) {
      const full = await this.prisma.order.findUnique({ where: { id: order.id }, include: { items: true, user: { select: { email: true, displayName: true } } } });
      if (full) this.notifier.orderShipped(full).catch(() => undefined);
    }
    return 'SUCCESS';
  }

  async printForm(orderIdOrNo: string) {
    const c = await this.config();
    const order = await this.prisma.order.findFirst({ where: { OR: [{ id: orderIdOrNo }, { merchantOrderNo: orderIdOrNo }] } });
    if (!order?.logisticsId || !order.shippingMethod) throw new BadRequestException('尚未建立物流單');
    if (isNwp(order.shippingMethod)) return nwpForm(c.nwp, 'printLabel', { LgsType: 'C2C', ShipType: NWP_SHIP_TYPES[order.shippingMethod], MerchantOrderNo: JSON.stringify([order.merchantOrderNo.slice(0, 30)]), TimeStamp: Math.floor(Date.now() / 1000) });
    return buildPrintForm({ merchantId: c.merchantId, hashKey: c.hashKey, hashIv: c.hashIv, testMode: c.testMode, subType: order.shippingMethod, logisticsId: order.logisticsId, paymentNo: order.logisticsPaymentNo ?? undefined, validationNo: order.logisticsValidationNo ?? undefined });
  }

  /** 綠界物流狀態通知（ServerReplyURL）：驗 CheckMacValue → 更新物流狀態；回 1|OK */
  async notify(body: Record<string, unknown>) {
    const c = await this.config();
    const params = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]));
    if (!params.CheckMacValue || logisticsCheckMac(params, c.hashKey, c.hashIv) !== params.CheckMacValue.toUpperCase()) {
      this.log.warn('ecpay logistics notify: CheckMacValue mismatch');
      return '0|CheckMacValue';
    }
    // 先以 MerchantTradeNo 精準對應，找不到才退回物流單號（OR 查詢在多筆共用同一物流單號時會撈到舊單——e2e 重跑實測）
    const order = (params.MerchantTradeNo ? await this.prisma.order.findFirst({ where: { merchantOrderNo: params.MerchantTradeNo } }) : null) ?? (params.AllPayLogisticsID ? await this.prisma.order.findFirst({ where: { logisticsId: params.AllPayLogisticsID }, orderBy: { createdAt: 'desc' } }) : null);
    if (!order) return '0|order';
    const mapped = mapRtnCode(params.RtnCode ?? '');
    await this.prisma.paymentEvent.create({ data: { orderId: order.id, provider: 'ecpay-logistics', type: `logistics_${params.RtnCode ?? 'unknown'}`, tradeNo: params.AllPayLogisticsID ?? null, payload: params as Prisma.InputJsonValue } });
    await this.prisma.order.update({ where: { id: order.id }, data: { logisticsStatus: params.RtnCode ?? null, ...(params.AllPayLogisticsID && !order.logisticsId ? { logisticsId: params.AllPayLogisticsID } : {}), ...(params.CVSPaymentNo ? { logisticsPaymentNo: params.CVSPaymentNo, trackingNo: params.CVSPaymentNo } : {}), ...(params.CVSValidationNo ? { logisticsValidationNo: params.CVSValidationNo } : {}), ...(mapped && mapped !== order.shippingStatus ? { shippingStatus: mapped, ...(mapped === 'shipped' && !order.shippedAt ? { shippedAt: new Date() } : {}) } : {}) } });
    if (mapped && mapped !== order.shippingStatus && (mapped === 'shipped' || mapped === 'delivered')) {
      const full = await this.prisma.order.findUnique({ where: { id: order.id }, include: { items: true, user: { select: { email: true, displayName: true } } } });
      if (full) this.notifier.orderShipped(full).catch(() => undefined);
    }
    return '1|OK';
  }
}

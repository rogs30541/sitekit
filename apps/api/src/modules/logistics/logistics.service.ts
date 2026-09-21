import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { LOGISTICS_METHOD_LABELS, SETTING_KEYS } from '@sitekit/shared';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifyService } from '../notify/notify.service';
import { SettingsService } from '../settings/settings.service';
import { buildCreateParams, buildMapForm, buildPrintForm, isCvs, logisticsCheckMac, mapRtnCode, parseCreateResponse } from './ecpay-logistics';

export interface LogisticsMethod {
  id: string;
  label: string;
  fee: number;
  kind: 'cvs' | 'home' | 'manual';
  provider: 'ecpay' | 'manual';
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
    const ecpayReady = provider === 'ecpay' && !!(merchantId && hashKey && hashIv);
    const methods = methodsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    return { provider, ecpayReady, merchantId, hashKey, hashIv, testMode: test !== 'false', methods, sender: { name: senderName, phone: senderPhone, zip: senderZip, address: senderAddress }, manualFee: Number(fee) || 0, freeOver: freeOver ? Number(freeOver) : null, fees };
  }

  /** 結帳可選配送方式：只列已啟用且（綠界方式）物流商已設定者 */
  async methods(): Promise<LogisticsMethod[]> {
    const c = await this.config();
    const out: LogisticsMethod[] = [];
    for (const id of c.methods) {
      if (id === 'manual') out.push({ id, label: LOGISTICS_METHOD_LABELS.manual, fee: c.fees.manual ?? c.manualFee, kind: 'manual', provider: 'manual' });
      else if (id in LOGISTICS_METHOD_LABELS && c.ecpayReady) out.push({ id, label: LOGISTICS_METHOD_LABELS[id as keyof typeof LOGISTICS_METHOD_LABELS], fee: c.fees[id] ?? c.manualFee, kind: isCvs(id) ? 'cvs' : 'home', provider: 'ecpay' });
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
    if (!c.ecpayReady || !isCvs(subType) || !c.methods.includes(subType)) throw new BadRequestException('此取貨方式未啟用');
    const site = await this.settings.siteUrl();
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

  async printForm(orderIdOrNo: string) {
    const c = await this.config();
    const order = await this.prisma.order.findFirst({ where: { OR: [{ id: orderIdOrNo }, { merchantOrderNo: orderIdOrNo }] } });
    if (!order?.logisticsId || !order.shippingMethod) throw new BadRequestException('尚未建立物流單');
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
    const order = await this.prisma.order.findFirst({ where: { OR: [{ merchantOrderNo: params.MerchantTradeNo ?? '' }, { logisticsId: params.AllPayLogisticsID ?? '' }] } });
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

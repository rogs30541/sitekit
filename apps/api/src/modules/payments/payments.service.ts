import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PAYMENT_METHOD_LABELS, type PaymentProvider } from '@sitekit/shared';
import { env, isProd } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { SettingsService } from '../settings/settings.service';
import { GATEWAYS, isGatewayProvider, type CheckoutPayload, type NotifyOutcome, type OrderSnapshot } from './gateways';

export type { CheckoutPayload } from './gateways';

/**
 * 金流編排層：多金流商（藍新／統一／綠界／LINE Pay／支付連）走同一條管線，mock 為本機假閘道（非 production）。
 * 鐵律：付款以伺服器端驗證（回呼驗章或向金流商 API 確認）為準；授權只在 OrdersService.markPaid 寫入；
 * 前景導回只重複同一段處理再轉到 /order-result，頁面本身只輪詢狀態。
 */
@Injectable()
export class PaymentsService {
  private readonly log = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly orders: OrdersService,
  ) {}

  private mockSig(merchantOrderNo: string) {
    return createHmac('sha256', env.SESSION_SECRET).update(`mock:${merchantOrderNo}`).digest('hex');
  }

  /** 結帳頁可選的付款方式（只列已設定完成者；mock 只在非 production） */
  async methods(): Promise<{ id: Exclude<PaymentProvider, 'none'>; label: string; testMode: boolean }[]> {
    const list = await this.settings.paymentMethods();
    const out: { id: Exclude<PaymentProvider, 'none'>; label: string; testMode: boolean }[] = [];
    for (const id of list) {
      if (id === 'mock') {
        if (!isProd) out.push({ id, label: PAYMENT_METHOD_LABELS.mock, testMode: true });
        continue;
      }
      const cfg = await this.settings.gateway(id);
      if (cfg.configured) out.push({ id, label: PAYMENT_METHOD_LABELS[id], testMode: cfg.testMode });
    }
    return out;
  }

  async checkout(idOrNo: string, userId: string, wanted?: string): Promise<CheckoutPayload> {
    const order = await this.orders.getOwned(idOrNo, userId);
    const site = await this.settings.siteUrl();
    const resultUrl = `${site}/order-result?order=${order.merchantOrderNo}`;
    if (order.status === 'paid') return { provider: 'free', kind: 'redirect', redirectUrl: resultUrl };
    if (order.status !== 'pending') throw new BadRequestException(`order is ${order.status}`);
    if (order.amount === 0) {
      await this.orders.markPaid(order.id, { provider: 'free' });
      return { provider: 'free', kind: 'redirect', redirectUrl: resultUrl };
    }
    const methods = await this.methods();
    if (!methods.length) throw new BadRequestException('payment provider is not configured');
    const provider = (wanted && methods.some((m) => m.id === wanted) ? wanted : methods[0].id) as Exclude<PaymentProvider, 'none'>;
    if (wanted && wanted !== provider) throw new BadRequestException(`payment method ${wanted} is not available`);

    if (provider === 'mock') {
      if (isProd) throw new ForbiddenException('mock payment is not allowed in production');
      await this.prisma.order.update({ where: { id: order.id }, data: { provider: 'mock' } });
      return { provider: 'mock', kind: 'redirect', redirectUrl: `${site}/pay/mock?order=${order.merchantOrderNo}&sig=${this.mockSig(order.merchantOrderNo)}` };
    }
    const gw = GATEWAYS[provider];
    if (!gw) throw new BadRequestException(`unknown provider ${provider}`);
    const cfg = await this.settings.gateway(provider);
    if (!cfg.configured) throw new BadRequestException(`${provider} is not configured`);
    const payload = await gw.checkout(cfg, {
      merchantOrderNo: order.merchantOrderNo,
      amount: order.amount,
      items: order.items.map((i) => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
      email: order.user.email,
      site,
      notifyUrl: `${site}/api/payments/${provider}/notify`,
      returnUrl: `${site}/api/payments/${provider}/return`,
      clientBackUrl: `${site}/member`,
      cancelUrl: `${resultUrl}&canceled=1`,
    });
    await this.prisma.order.update({ where: { id: order.id }, data: { provider, ...(payload.tradeNo ? { providerTradeNo: payload.tradeNo } : {}) } });
    return payload;
  }

  private snapshot = async (merchantOrderNo: string): Promise<OrderSnapshot | null> => {
    const o = await this.prisma.order.findUnique({ where: { merchantOrderNo }, select: { id: true, merchantOrderNo: true, amount: true, status: true, providerTradeNo: true } });
    return o ?? null;
  };

  /**
   * 金流商回呼（NotifyURL）與前景導回（ReturnURL）共用：驗證 → 金額比對 → payment_events 冪等 → 狀態機。
   * 回傳 merchantOrderNo 供導回使用；ack 為回給金流商的字串。
   */
  async handle(provider: string, body: Record<string, unknown>, source: 'notify' | 'return'): Promise<{ merchantOrderNo: string | null; ok: boolean; ack: string }> {
    if (!isGatewayProvider(provider)) return { merchantOrderNo: null, ok: false, ack: 'IGNORED' };
    const gw = GATEWAYS[provider]!;
    const cfg = await this.settings.gateway(provider);
    let outcome: NotifyOutcome;
    try {
      outcome = await gw.handle(cfg, body, { source, getOrder: this.snapshot });
    } catch (e) {
      this.log.warn(`${provider} ${source}: handler threw: ${e instanceof Error ? e.message : e}`);
      return { merchantOrderNo: null, ok: false, ack: gw.ack(false) };
    }
    if (!outcome.verified) {
      this.log.warn(`${provider} ${source}: rejected (${outcome.reason})`);
      return { merchantOrderNo: outcome.merchantOrderNo, ok: false, ack: gw.ack(false) };
    }
    const no = outcome.merchantOrderNo;
    const order = await this.prisma.order.findUnique({ where: { merchantOrderNo: no } });
    if (!order) return { merchantOrderNo: no, ok: false, ack: gw.ack(false) };
    if (outcome.amount !== undefined && Math.round(outcome.amount) !== order.amount) {
      this.log.warn(`${provider} ${source}: amount mismatch for ${no}: ${outcome.amount} vs ${order.amount}`);
      return { merchantOrderNo: no, ok: false, ack: gw.ack(false) };
    }
    if (outcome.kind === 'ignored') return { merchantOrderNo: no, ok: true, ack: gw.ack(true) };

    const tradeNo = outcome.tradeNo ?? null;
    const dup = tradeNo ? await this.prisma.paymentEvent.findFirst({ where: { orderId: order.id, provider, type: outcome.kind, tradeNo } }) : null;
    if (!dup) {
      await this.prisma.paymentEvent.create({ data: { orderId: order.id, provider, type: outcome.kind, tradeNo, payload: { source, ...(outcome.raw as object) } as Prisma.InputJsonValue } });
    }
    if (outcome.kind === 'failed') {
      await this.orders.markFailed(order.id, `${provider}: ${outcome.message ?? 'failed'}`);
      return { merchantOrderNo: no, ok: false, ack: gw.ack(true) };
    }
    if (outcome.kind === 'vacc_issued') {
      await this.orders.setVirtualAccount(order.id, outcome.virtualAccount ?? '', outcome.expireAt ?? null, tradeNo ?? undefined);
      return { merchantOrderNo: no, ok: true, ack: gw.ack(true) };
    }
    await this.orders.markPaid(order.id, { provider, tradeNo: tradeNo ?? undefined, paymentType: outcome.paymentType, paidAt: outcome.paidAt ?? new Date() });
    return { merchantOrderNo: no, ok: true, ack: gw.ack(true) };
  }

  /** 本機假閘道回呼（非 production）：以 HMAC 簽章防止任意呼叫。 */
  async handleMock(merchantOrderNo: string, sig: string, result: 'success' | 'fail') {
    if (isProd) throw new ForbiddenException('mock payment is not allowed in production');
    const expect = this.mockSig(merchantOrderNo);
    if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) throw new ForbiddenException('bad signature');
    const order = await this.orders.findByIdOrNo(merchantOrderNo);
    await this.prisma.paymentEvent.create({ data: { orderId: order.id, provider: 'mock', type: result === 'success' ? 'paid' : 'failed', tradeNo: `MOCK${Date.now()}`, payload: { result } } });
    if (result === 'success') return this.orders.markPaid(order.id, { provider: 'mock', tradeNo: `MOCK${Date.now()}`, paymentType: 'CREDIT' });
    return this.orders.markFailed(order.id, 'mock: declined');
  }

  /** 管理員退款：供應商退款成功後才標記 refunded 並撤銷授權。 */
  async adminRefund(idOrNo: string, approve: boolean, note: string | undefined, actor: string) {
    const order = await this.orders.findByIdOrNo(idOrNo);
    if (!approve) return this.orders.rejectRefund(order.id, note);
    if (order.status !== 'paid') throw new BadRequestException(`order is ${order.status}`);
    const provider = order.provider ?? '';
    if (isGatewayProvider(provider)) {
      const gw = GATEWAYS[provider]!;
      if (!gw.refund) throw new BadRequestException(`${provider} does not support API refund; refund at the provider console first`);
      const cfg = await this.settings.gateway(provider);
      const r = await gw.refund(cfg, { id: order.id, merchantOrderNo: order.merchantOrderNo, amount: order.amount, status: order.status, providerTradeNo: order.providerTradeNo });
      await this.prisma.paymentEvent.create({ data: { orderId: order.id, provider, type: r.ok ? `refund_${r.via}` : 'refund_failed', payload: r as unknown as Prisma.InputJsonValue } });
      if (!r.ok) throw new BadRequestException(`${provider} refund failed: ${r.message}`);
    }
    return this.orders.markRefunded(order.id, `refund by ${actor}${note ? `: ${note}` : ''}`);
  }
}

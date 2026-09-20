import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { env, isProd } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { SettingsService } from '../settings/settings.service';
import { buildMpgForm, creditRefund, parseNotify, verifyCheckCode } from './newebpay';

export type CheckoutPayload =
  | { provider: 'free' | 'mock'; redirectUrl: string }
  | { provider: 'newebpay'; gatewayUrl: string; fields: Record<string, string> };

/**
 * 金流：藍新 MPG 為正式供應商，mock 為本機假閘道（非 production）。
 * 鐵律：付款以伺服器回呼（驗章通過）為準；ReturnURL 導回只更新畫面。
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

  async checkout(idOrNo: string, userId: string): Promise<CheckoutPayload> {
    const order = await this.orders.getOwned(idOrNo, userId);
    const site = await this.settings.siteUrl();
    const resultUrl = `${site}/order-result?order=${order.merchantOrderNo}`;
    if (order.status === 'paid') return { provider: 'free', redirectUrl: resultUrl };
    if (order.status !== 'pending') throw new BadRequestException(`order is ${order.status}`);
    if (order.amount === 0) {
      await this.orders.markPaid(order.id, { provider: 'free' });
      return { provider: 'free', redirectUrl: resultUrl };
    }
    const provider = await this.settings.paymentProvider();
    if (provider === 'mock') {
      if (isProd) throw new ForbiddenException('mock payment is not allowed in production');
      return { provider: 'mock', redirectUrl: `${site}/pay/mock?order=${order.merchantOrderNo}&sig=${this.mockSig(order.merchantOrderNo)}` };
    }
    if (provider === 'newebpay') {
      const cfg = await this.settings.newebpay();
      if (!cfg.configured) throw new BadRequestException('newebpay is not configured');
      const form = buildMpgForm({
        merchantId: cfg.merchantId,
        hashKey: cfg.hashKey,
        hashIv: cfg.hashIv,
        gatewayUrl: cfg.gatewayUrl,
        merchantOrderNo: order.merchantOrderNo,
        amount: order.amount,
        itemDesc: order.items.map((i) => i.name).join('、'),
        email: order.user.email,
        notifyUrl: `${site}/api/payments/newebpay/notify`,
        returnUrl: `${site}/api/payments/newebpay/return`,
        clientBackUrl: `${site}/member`,
        credit: true,
        vacc: true,
      });
      await this.prisma.order.update({ where: { id: order.id }, data: { provider: 'newebpay' } });
      return { provider: 'newebpay', ...form };
    }
    throw new BadRequestException('payment provider is not configured');
  }

  /** 藍新 NotifyURL／ReturnURL 共用處理。回傳 merchantOrderNo 供導回使用。 */
  async handleNewebpay(body: Record<string, unknown>, source: 'notify' | 'return'): Promise<{ merchantOrderNo: string | null; ok: boolean }> {
    const cfg = await this.settings.newebpay();
    const tradeInfo = String(body.TradeInfo ?? '');
    const tradeSha = String(body.TradeSha ?? '');
    const parsed = parseNotify(tradeInfo, tradeSha, cfg.hashKey, cfg.hashIv);
    if (!parsed) {
      this.log.warn(`newebpay ${source}: signature check failed`);
      return { merchantOrderNo: null, ok: false };
    }
    const r = parsed.Result ?? {};
    const no = r.MerchantOrderNo ? String(r.MerchantOrderNo) : null;
    if (!no) return { merchantOrderNo: null, ok: false };
    if (!verifyCheckCode(r, cfg.merchantId, cfg.hashKey, cfg.hashIv)) {
      this.log.warn(`newebpay ${source}: CheckCode mismatch for ${no}`);
      return { merchantOrderNo: no, ok: false };
    }
    const order = await this.prisma.order.findUnique({ where: { merchantOrderNo: no } });
    if (!order) return { merchantOrderNo: no, ok: false };
    if (r.Amt !== undefined && Number(r.Amt) !== order.amount) {
      this.log.warn(`newebpay ${source}: amount mismatch for ${no}: ${r.Amt} vs ${order.amount}`);
      return { merchantOrderNo: no, ok: false };
    }

    const type = parsed.Status !== 'SUCCESS' ? 'failed' : r.PaymentType === 'VACC' && r.BankCode && r.CodeNo && !r.PayBankCode ? 'vacc_issued' : 'paid';
    const tradeNo = r.TradeNo ? String(r.TradeNo) : null;
    const dup = tradeNo ? await this.prisma.paymentEvent.findFirst({ where: { orderId: order.id, provider: 'newebpay', type, tradeNo } }) : null;
    if (!dup) {
      await this.prisma.paymentEvent.create({ data: { orderId: order.id, provider: 'newebpay', type, tradeNo, payload: { source, ...parsed } as Prisma.InputJsonValue } });
    }

    if (type === 'failed') {
      await this.orders.markFailed(order.id, `${parsed.Status} ${parsed.Message ?? ''}`.trim());
      return { merchantOrderNo: no, ok: false };
    }
    if (type === 'vacc_issued') {
      const exp = r.ExpireDate ? new Date(String(r.ExpireDate).replace(/(\d{4})-?(\d{2})-?(\d{2})/, '$1-$2-$3T23:59:59+08:00')) : null;
      await this.orders.setVirtualAccount(order.id, `(${r.BankCode}) ${r.CodeNo}`, exp && !Number.isNaN(exp.getTime()) ? exp : null, tradeNo ?? undefined);
      return { merchantOrderNo: no, ok: true };
    }
    const paidAt = r.PayTime ? new Date(String(r.PayTime).replace(' ', 'T') + '+08:00') : new Date();
    await this.orders.markPaid(order.id, { provider: 'newebpay', tradeNo: tradeNo ?? undefined, paymentType: r.PaymentType ? String(r.PaymentType) : undefined, paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt });
    return { merchantOrderNo: no, ok: true };
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
    if (order.provider === 'newebpay') {
      const cfg = await this.settings.newebpay();
      const r = await creditRefund({ gatewayUrl: cfg.gatewayUrl, merchantId: cfg.merchantId, hashKey: cfg.hashKey, hashIv: cfg.hashIv, merchantOrderNo: order.merchantOrderNo, amount: order.amount });
      await this.prisma.paymentEvent.create({ data: { orderId: order.id, provider: 'newebpay', type: r.ok ? `refund_${r.via}` : 'refund_failed', payload: r as unknown as Prisma.InputJsonValue } });
      if (!r.ok) throw new BadRequestException(`newebpay refund failed: ${r.message}`);
    }
    return this.orders.markRefunded(order.id, `refund by ${actor}${note ? `: ${note}` : ''}`);
  }
}

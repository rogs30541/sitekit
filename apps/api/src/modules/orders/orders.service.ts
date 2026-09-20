import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceService } from '../invoice/invoice.service';

const createInput = z.object({
  items: z.array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(99).default(1) })).min(1).max(20),
});

export interface PaidInfo {
  provider: string;
  tradeNo?: string;
  paymentType?: string;
  paidAt?: Date;
  note?: string;
}

const ORDER_INCLUDE = { items: true, user: { select: { email: true, displayName: true } } } as const;

/** 藍新 MerchantOrderNo：英數 ≤30 字。 */
function newMerchantOrderNo() {
  return `SK${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * 訂單狀態機：pending → paid | failed | canceled；paid → refunded。
 * 從度哥繼承的鐵律：授權（entitlements）只在 markPaid 內寫入，前端導回頁面不作數。
 */
@Injectable()
export class OrdersService {
  private readonly log = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoice: InvoiceService,
  ) {}

  async create(userId: string, input: unknown) {
    const r = createInput.safeParse(input);
    if (!r.success) throw new BadRequestException(r.error.flatten().fieldErrors);
    const ids = r.data.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: ids }, isActive: true } });
    if (products.length !== new Set(ids).size) throw new BadRequestException('some products are unavailable');
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = r.data.items.map((i) => {
      const p = byId.get(i.productId)!;
      return { productId: p.id, name: p.name, qty: i.qty, unitPrice: p.price };
    });
    const amount = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const order = await this.prisma.order.create({
      data: { userId, merchantOrderNo: newMerchantOrderNo(), amount, items: { create: items } },
      include: ORDER_INCLUDE,
    });
    if (amount === 0) return this.markPaid(order.id, { provider: 'free' });
    return order;
  }

  async findByIdOrNo(idOrNo: string) {
    const order = await this.prisma.order.findFirst({ where: { OR: [{ id: idOrNo }, { merchantOrderNo: idOrNo }] }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException('order not found');
    return order;
  }

  async getOwned(idOrNo: string, userId: string) {
    const order = await this.findByIdOrNo(idOrNo);
    if (order.userId !== userId) throw new ForbiddenException('not your order');
    return order;
  }

  listMine(userId: string) {
    return this.prisma.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { items: true }, take: 100 });
  }

  listAll(status?: string) {
    return this.prisma.order.findMany({
      where: status ? { status: status as 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled' } : {},
      orderBy: { createdAt: 'desc' },
      include: ORDER_INCLUDE,
      take: 200,
    });
  }

  /** 冪等：已 paid 直接回傳；在交易內同時寫入授權。 */
  async markPaid(orderId: string, info: PaidInfo) {
    const order = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
      if (!o) throw new NotFoundException('order not found');
      if (o.status === 'paid' || o.status === 'refunded') return o;
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'paid', provider: info.provider, providerTradeNo: info.tradeNo ?? o.providerTradeNo, paymentType: info.paymentType ?? o.paymentType, paidAt: info.paidAt ?? new Date(), note: info.note ?? o.note },
        include: ORDER_INCLUDE,
      });
      for (const item of o.items) {
        await tx.entitlement.upsert({
          where: { userId_productId: { userId: o.userId, productId: item.productId } },
          update: { orderId: o.id, source: 'purchase' },
          create: { userId: o.userId, productId: item.productId, orderId: o.id, source: 'purchase' },
        });
      }
      return updated;
    });
    if (order.status === 'paid' && order.provider !== 'free') {
      this.invoice.issueForOrder(order).catch((e) => this.log.error(`invoice issue failed: ${e instanceof Error ? e.message : e}`));
    }
    return order;
  }

  async markFailed(orderId: string, reason: string) {
    const o = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!o || o.status !== 'pending') return o;
    return this.prisma.order.update({ where: { id: orderId }, data: { status: 'failed', note: reason.slice(0, 500) } });
  }

  async setVirtualAccount(orderId: string, virtualAccount: string, expireAt: Date | null, tradeNo?: string) {
    return this.prisma.order.update({ where: { id: orderId }, data: { virtualAccount, expireAt, providerTradeNo: tradeNo, paymentType: 'VACC' } });
  }

  async cancel(idOrNo: string, userId: string) {
    const o = await this.getOwned(idOrNo, userId);
    if (o.status !== 'pending') throw new BadRequestException('only pending orders can be canceled');
    return this.prisma.order.update({ where: { id: o.id }, data: { status: 'canceled' } });
  }

  async requestRefund(idOrNo: string, userId: string, reason: string) {
    const o = await this.getOwned(idOrNo, userId);
    if (o.status !== 'paid') throw new BadRequestException('only paid orders can be refunded');
    if (o.refundStatus === 'requested') return o;
    return this.prisma.order.update({ where: { id: o.id }, data: { refundStatus: 'requested', refundReason: reason.slice(0, 500) } });
  }

  async rejectRefund(orderId: string, note?: string) {
    return this.prisma.order.update({ where: { id: orderId }, data: { refundStatus: 'rejected', note } });
  }

  /** 退款完成：狀態 refunded、撤銷本訂單授權、作廢發票（best-effort）。 */
  async markRefunded(orderId: string, note?: string) {
    const order = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.findUnique({ where: { id: orderId } });
      if (!o) throw new NotFoundException('order not found');
      if (o.status === 'refunded') return o;
      await tx.entitlement.deleteMany({ where: { orderId } });
      return tx.order.update({ where: { id: orderId }, data: { status: 'refunded', refundStatus: 'done', refundedAt: new Date(), note } });
    });
    this.invoice.invalidateForOrder(orderId).catch(() => undefined);
    return order;
  }

  /** 管理員手動補授權（贈送／匯款核帳）。 */
  async grantManual(userId: string, productId: string, source = 'manual') {
    return this.prisma.entitlement.upsert({
      where: { userId_productId: { userId, productId } },
      update: { source },
      create: { userId, productId, source },
    });
  }
}

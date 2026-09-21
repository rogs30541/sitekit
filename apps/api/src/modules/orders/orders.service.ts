import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { SETTING_KEYS, SHIPPING_STATUSES } from '@sitekit/shared';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceService } from '../invoice/invoice.service';
import { SettingsService } from '../settings/settings.service';
import { CouponsService } from './coupons.service';

const shippingInput = z.object({ name: z.string().trim().min(1).max(60), phone: z.string().trim().min(6).max(30), address: z.string().trim().min(5).max(200) });
const createInput = z.object({
  items: z.array(z.object({ productId: z.string().min(1), qty: z.number().int().min(1).max(99).default(1) })).min(1).max(20),
  couponCode: z.string().trim().max(40).optional(),
  shipping: shippingInput.optional(),
});
const shippingUpdate = z.object({ status: z.enum(SHIPPING_STATUSES), carrier: z.string().trim().max(60).nullable().optional(), trackingNo: z.string().trim().max(80).nullable().optional() });

export interface PaidInfo {
  provider: string;
  tradeNo?: string;
  paymentType?: string;
  paidAt?: Date;
  note?: string;
}

const ORDER_INCLUDE = { items: true, user: { select: { email: true, displayName: true } } } as const;
type Tx = Prisma.TransactionClient;

/** 藍新 MerchantOrderNo：英數 ≤30 字（綠界 ≤20）。 */
function newMerchantOrderNo() {
  return `SK${Date.now().toString(36).toUpperCase()}${randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * 訂單狀態機：pending → paid | failed | canceled；paid → refunded。
 * 從度哥繼承的鐵律：授權（entitlements）只在 markPaid 內寫入，前端導回頁面不作數。
 * P4：金額＝subtotal − 折扣 ＋ 運費；實體商品下單即扣庫存（交易鎖 stock ≥ qty），取消／失敗／退款回補；逾期未付自動取消。
 */
@Injectable()
export class OrdersService implements OnModuleInit {
  private readonly log = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoice: InvoiceService,
    private readonly settings: SettingsService,
    private readonly coupons: CouponsService,
  ) {}

  /** 每小時掃一次逾期未付款訂單（可由 ops expire_orders 手動觸發）。 */
  onModuleInit() {
    const timer = setInterval(() => this.expirePending().catch((e) => this.log.warn(`expire failed: ${e instanceof Error ? e.message : e}`)), 3600_000);
    timer.unref();
  }

  /** 試算：小計、折扣、運費、應付。購物車頁即時顯示用；不寫任何資料。 */
  async quote(input: unknown) {
    const r = createInput.safeParse(input);
    if (!r.success) throw new BadRequestException(r.error.flatten().fieldErrors);
    const products = await this.prisma.product.findMany({ where: { id: { in: r.data.items.map((i) => i.productId) }, isActive: true } });
    if (products.length !== new Set(r.data.items.map((i) => i.productId)).size) throw new BadRequestException('some products are unavailable');
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = r.data.items.map((i) => {
      const p = byId.get(i.productId)!;
      if (p.stock !== null && p.stock < i.qty) throw new BadRequestException(`「${p.name}」庫存不足（剩 ${p.stock}）`);
      return { productId: p.id, name: p.name, qty: i.qty, unitPrice: p.price, type: p.type };
    });
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const needsShipping = items.some((i) => i.type === 'physical');
    let discount = 0;
    let couponCode: string | null = null;
    if (r.data.couponCode) {
      const c = await this.coupons.evaluate(r.data.couponCode, subtotal);
      discount = c.discount;
      couponCode = c.code;
    }
    const [feeRaw, freeOverRaw] = await Promise.all([this.settings.get(SETTING_KEYS.shippingFee, 'SHIPPING_FEE', '0'), this.settings.get(SETTING_KEYS.shippingFreeOver, 'SHIPPING_FREE_OVER', '')]);
    const fee = Number(feeRaw) || 0;
    const freeOver = freeOverRaw ? Number(freeOverRaw) : null;
    const shippingFee = needsShipping && !(freeOver !== null && subtotal - discount >= freeOver) ? fee : 0;
    const amount = Math.max(0, subtotal - discount) + shippingFee;
    return { items, subtotal, discount, couponCode, shippingFee, needsShipping, amount, shipping: r.data.shipping ?? null };
  }

  async create(userId: string, input: unknown) {
    const q = await this.quote(input);
    if (q.needsShipping && !q.shipping) throw new BadRequestException('實體商品需填寫收件資料');
    const order = await this.prisma.$transaction(async (tx) => {
      await this.reserveStock(tx, q.items);
      return tx.order.create({
        data: {
          userId,
          merchantOrderNo: newMerchantOrderNo(),
          amount: q.amount,
          subtotal: q.subtotal,
          discount: q.discount,
          couponCode: q.couponCode,
          shippingFee: q.shippingFee,
          shippingName: q.shipping?.name ?? null,
          shippingPhone: q.shipping?.phone ?? null,
          shippingAddress: q.shipping?.address ?? null,
          shippingStatus: q.needsShipping ? 'pending' : null,
          items: { create: q.items.map(({ productId, name, qty, unitPrice }) => ({ productId, name, qty, unitPrice })) },
        },
        include: ORDER_INCLUDE,
      });
    });
    if (q.amount === 0) return this.markPaid(order.id, { provider: 'free' });
    return order;
  }

  /** 交易鎖扣庫存：updateMany 條件 stock ≥ qty，影響列數 0＝被搶光。stock=null 不追蹤。 */
  private async reserveStock(tx: Tx, items: { productId: string; qty: number; name: string }[]) {
    for (const i of items) {
      const p = await tx.product.findUnique({ where: { id: i.productId }, select: { stock: true } });
      if (p?.stock === null || p?.stock === undefined) continue;
      const r = await tx.product.updateMany({ where: { id: i.productId, stock: { gte: i.qty } }, data: { stock: { decrement: i.qty } } });
      if (r.count === 0) throw new BadRequestException(`「${i.name}」庫存不足`);
    }
  }

  private async releaseStock(tx: Tx, orderId: string) {
    const items = await tx.orderItem.findMany({ where: { orderId }, include: { product: { select: { stock: true } } } });
    for (const i of items) {
      if (i.product.stock === null) continue;
      await tx.product.update({ where: { id: i.productId }, data: { stock: { increment: i.qty } } });
    }
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

  listAll(status?: string, shippingStatus?: string) {
    return this.prisma.order.findMany({
      where: { ...(status ? { status: status as 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled' } : {}), ...(shippingStatus ? { shippingStatus } : {}) },
      orderBy: { createdAt: 'desc' },
      include: ORDER_INCLUDE,
      take: 200,
    });
  }

  /** 冪等：已 paid 直接回傳；在交易內同時寫入授權、累加折扣碼次數。 */
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
        // 觀看期限：課程設定 unlimited / days / until 決定授權到期日；實體商品不發授權
        const product = await tx.product.findUnique({ where: { id: item.productId }, select: { type: true } });
        if (product?.type === 'physical') continue;
        const course = await tx.course.findUnique({ where: { productId: item.productId }, select: { accessMode: true, accessDays: true, accessUntil: true } });
        const expiresAt = course?.accessMode === 'days' && course.accessDays ? new Date(Date.now() + course.accessDays * 86_400_000) : course?.accessMode === 'until' ? (course.accessUntil ?? null) : null;
        await tx.entitlement.upsert({
          where: { userId_productId: { userId: o.userId, productId: item.productId } },
          update: { orderId: o.id, source: 'purchase', expiresAt },
          create: { userId: o.userId, productId: item.productId, orderId: o.id, source: 'purchase', expiresAt },
        });
      }
      if (o.couponCode) await tx.coupon.updateMany({ where: { code: o.couponCode }, data: { usedCount: { increment: 1 } } });
      return updated;
    });
    if (order.status === 'paid' && order.provider !== 'free') {
      this.invoice.issueForOrder(order).catch((e) => this.log.error(`invoice issue failed: ${e instanceof Error ? e.message : e}`));
    }
    return order;
  }

  async markFailed(orderId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const o = await tx.order.findUnique({ where: { id: orderId } });
      if (!o || o.status !== 'pending') return o;
      await this.releaseStock(tx, orderId);
      return tx.order.update({ where: { id: orderId }, data: { status: 'failed', note: reason.slice(0, 500) } });
    });
  }

  async setVirtualAccount(orderId: string, virtualAccount: string, expireAt: Date | null, tradeNo?: string) {
    return this.prisma.order.update({ where: { id: orderId }, data: { virtualAccount, expireAt, providerTradeNo: tradeNo, paymentType: 'VACC' } });
  }

  async cancel(idOrNo: string, userId: string) {
    const o = await this.getOwned(idOrNo, userId);
    if (o.status !== 'pending') throw new BadRequestException('only pending orders can be canceled');
    return this.prisma.$transaction(async (tx) => {
      await this.releaseStock(tx, o.id);
      return tx.order.update({ where: { id: o.id }, data: { status: 'canceled' } });
    });
  }

  /** 逾期未付款（無虛擬帳號或帳號已過期）→ canceled 並回補庫存。 */
  async expirePending(hours?: number) {
    const h = hours ?? (Number(await this.settings.get(SETTING_KEYS.orderExpireHours, 'ORDER_EXPIRE_HOURS', '72')) || 72);
    const cutoff = new Date(Date.now() - h * 3600_000);
    const stale = await this.prisma.order.findMany({ where: { status: 'pending', createdAt: { lt: cutoff }, OR: [{ virtualAccount: null }, { expireAt: { lt: new Date() } }] }, select: { id: true, merchantOrderNo: true } });
    for (const o of stale) {
      await this.prisma.$transaction(async (tx) => {
        await this.releaseStock(tx, o.id);
        await tx.order.update({ where: { id: o.id }, data: { status: 'canceled', note: `expired after ${h}h` } });
      });
    }
    return { hours: h, canceled: stale.map((s) => s.merchantOrderNo) };
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

  /** 退款完成：狀態 refunded、撤銷本訂單授權、回補庫存、作廢發票（best-effort）。 */
  async markRefunded(orderId: string, note?: string) {
    const order = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.findUnique({ where: { id: orderId } });
      if (!o) throw new NotFoundException('order not found');
      if (o.status === 'refunded') return o;
      await tx.entitlement.deleteMany({ where: { orderId } });
      await this.releaseStock(tx, orderId);
      return tx.order.update({ where: { id: orderId }, data: { status: 'refunded', refundStatus: 'done', refundedAt: new Date(), note } });
    });
    this.invoice.invalidateForOrder(orderId).catch(() => undefined);
    return order;
  }

  /** 物流狀態：只有已付款且需出貨的訂單可更新。 */
  async updateShipping(idOrNo: string, input: unknown) {
    const d = shippingUpdate.parse(input);
    const o = await this.findByIdOrNo(idOrNo);
    if (!o.shippingStatus) throw new BadRequestException('this order has no shipping');
    if (o.status !== 'paid' && d.status !== 'returned') throw new BadRequestException(`order is ${o.status}; ship only paid orders`);
    return this.prisma.order.update({
      where: { id: o.id },
      data: { shippingStatus: d.status, ...(d.carrier !== undefined ? { carrier: d.carrier } : {}), ...(d.trackingNo !== undefined ? { trackingNo: d.trackingNo } : {}), ...(d.status === 'shipped' && !o.shippedAt ? { shippedAt: new Date() } : {}) },
      include: ORDER_INCLUDE,
    });
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

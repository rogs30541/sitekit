import { background } from '../../env';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '../../compat';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { SETTING_KEYS, SHIPPING_STATUSES, effectivePrice } from '@sitekit/shared';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { InvoiceService } from '../invoice/invoice.service';
import { SettingsService } from '../settings/settings.service';
import { CouponsService } from './coupons.service';
import { LogisticsService } from '../logistics/logistics.service';
import { NotifyService } from '../notify/notify.service';
import { events } from '../../plugins';

const shippingInput = z.object({
  method: z.string().trim().max(20).optional(),
  name: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(6).max(30),
  address: z.string().trim().max(200).optional().default(''),
  /** 超商取貨：電子地圖回傳的簽章 token（伺服器驗章解出門市） */
  storeToken: z.string().max(2000).optional(),
});
const invoiceInput = z.object({ type: z.enum(['personal', 'mobile', 'citizen', 'company', 'donate']).default('personal'), carrierNum: z.string().trim().max(30).nullable().optional(), taxId: z.string().trim().max(8).nullable().optional(), title: z.string().trim().max(60).nullable().optional(), loveCode: z.string().trim().max(7).nullable().optional() });
const createInput = z.object({
  items: z.array(z.object({ productId: z.string().min(1), variantId: z.string().nullable().optional(), qty: z.number().int().min(1).max(99).default(1) })).min(1).max(20),
  couponCode: z.string().trim().max(40).optional(),
  shipping: shippingInput.optional(),
  invoice: invoiceInput.optional(),
});
const shippingUpdate = z.object({ status: z.enum(SHIPPING_STATUSES), carrier: z.string().trim().max(60).nullable().optional(), trackingNo: z.string().trim().max(80).nullable().optional() });

export interface PaidInfo {
  provider: string;
  tradeNo?: string;
  paymentType?: string;
  paidAt?: Date;
  note?: string;
}

const ORDER_INCLUDE = { items: true, user: { select: { email: true, displayName: true } }, invoices: { select: { number: true, status: true, provider: true }, orderBy: { createdAt: 'desc' as const }, take: 1 } } as const;
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
    private readonly prisma: PrismaClient,
    private readonly invoice: InvoiceService,
    private readonly settings: SettingsService,
    private readonly coupons: CouponsService,
    private readonly notify: NotifyService,
    private readonly logistics: LogisticsService,
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
    const products = await this.prisma.product.findMany({ where: { id: { in: r.data.items.map((i) => i.productId) }, isActive: true }, include: { variants: { where: { isActive: true } } } });
    if (products.length !== new Set(r.data.items.map((i) => i.productId)).size) throw new BadRequestException('some products are unavailable');
    const byId = new Map(products.map((p) => [p.id, p]));
    const items = r.data.items.map((i) => {
      const p = byId.get(i.productId)!;
      // 多規格：必須指定規格；價格／庫存以規格為準（規格價格 null＝沿用主商品）
      const v = i.variantId ? p.variants.find((x) => x.id === i.variantId) : null;
      if (p.variants.length && !v) throw new BadRequestException(`「${p.name}」請選擇規格`);
      if (i.variantId && !v) throw new BadRequestException(`「${p.name}」規格不存在或已下架`);
      const stock = v ? v.stock : p.stock;
      if (stock !== null && stock < i.qty) throw new BadRequestException(`「${p.name}${v ? `（${v.name}）` : ''}」庫存不足（剩 ${stock}）`);
      return { productId: p.id, variantId: v?.id ?? null, name: v ? `${p.name}（${v.name}）` : p.name, qty: i.qty, unitPrice: v?.price ?? effectivePrice(p).price, type: p.type };
    });
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const needsShipping = items.some((i) => i.type === 'physical');
    // 電商與課程購物車各自獨立：同一張訂單不可混合
    const courseCount = items.filter((i) => i.type === 'course').length;
    if (courseCount && courseCount !== items.length) throw new BadRequestException('課程與商品請分開結帳');
    const scope: 'shop' | 'course' = courseCount ? 'course' : 'shop';
    let discount = 0;
    let couponCode: string | null = null;
    if (r.data.couponCode) {
      const c = await this.coupons.evaluate(r.data.couponCode, subtotal, scope);
      discount = c.discount;
      couponCode = c.code;
    }
    const ship = needsShipping ? await this.logistics.feeFor(r.data.shipping?.method, subtotal - discount) : null;
    const shippingFee = ship?.fee ?? 0;
    const shippingMethod = ship?.method ?? null;
    const store = r.data.shipping?.storeToken ? this.logistics.verifyStoreToken(r.data.shipping.storeToken) : null;
    if (needsShipping && shippingMethod?.kind === 'cvs' && !store) throw new BadRequestException('超商取貨請先選擇門市');
    if (needsShipping && shippingMethod && shippingMethod.kind !== 'cvs' && r.data.shipping && !r.data.shipping.address) throw new BadRequestException('宅配需填寫地址');
    const amount = Math.max(0, subtotal - discount) + shippingFee;
    const invoice = this.invoice.validateRequest(r.data.invoice);
    return { items, subtotal, discount, couponCode, shippingFee, needsShipping, amount, shipping: r.data.shipping ?? null, shippingMethod, store, invoice, scope };
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
          scope: q.scope,
          amount: q.amount,
          subtotal: q.subtotal,
          discount: q.discount,
          couponCode: q.couponCode,
          shippingFee: q.shippingFee,
          shippingName: q.shipping?.name ?? null,
          shippingPhone: q.shipping?.phone ?? null,
          shippingAddress: q.store ? q.store.address : (q.shipping?.address || null),
          shippingStatus: q.needsShipping ? 'pending' : null,
          shippingMethod: q.needsShipping ? (q.shippingMethod?.id ?? 'manual') : null,
          cvsStoreId: q.store?.id ?? null,
          cvsStoreName: q.store?.name ?? null,
          cvsStoreAddress: q.store?.address ?? null,
          invoiceType: q.invoice.type,
          invoiceCarrierNum: q.invoice.carrierNum,
          invoiceTaxId: q.invoice.taxId,
          invoiceTitle: q.invoice.title,
          invoiceLoveCode: q.invoice.loveCode,
          items: { create: q.items.map(({ productId, variantId, name, qty, unitPrice }) => ({ productId, variantId, name, qty, unitPrice })) },
        },
        include: ORDER_INCLUDE,
      });
    });
    if (q.amount === 0) return this.markPaid(order.id, { provider: 'free' });
    return order;
  }

  /** 交易鎖扣庫存：updateMany 條件 stock ≥ qty，影響列數 0＝被搶光。stock=null 不追蹤。 */
  private async reserveStock(tx: Tx, items: { productId: string; variantId?: string | null; qty: number; name: string }[]) {
    for (const i of items) {
      if (i.variantId) {
        const v = await tx.productVariant.findUnique({ where: { id: i.variantId }, select: { stock: true } });
        if (v?.stock === null || v?.stock === undefined) continue;
        const r = await tx.productVariant.updateMany({ where: { id: i.variantId, stock: { gte: i.qty } }, data: { stock: { decrement: i.qty } } });
        if (r.count === 0) throw new BadRequestException(`「${i.name}」庫存不足`);
        continue;
      }
      const p = await tx.product.findUnique({ where: { id: i.productId }, select: { stock: true } });
      if (p?.stock === null || p?.stock === undefined) continue;
      const r = await tx.product.updateMany({ where: { id: i.productId, stock: { gte: i.qty } }, data: { stock: { decrement: i.qty } } });
      if (r.count === 0) throw new BadRequestException(`「${i.name}」庫存不足`);
    }
  }

  private async releaseStock(tx: Tx, orderId: string) {
    const items = await tx.orderItem.findMany({ where: { orderId }, include: { product: { select: { stock: true } }, variant: { select: { stock: true } } } });
    for (const i of items) {
      if (i.variantId) {
        if (i.variant && i.variant.stock !== null) await tx.productVariant.update({ where: { id: i.variantId }, data: { stock: { increment: i.qty } } });
        continue;
      }
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

  listAll(status?: string, shippingStatus?: string, scope?: string) {
    return this.prisma.order.findMany({
      where: { ...(status ? { status: status as 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled' } : {}), ...(shippingStatus ? { shippingStatus } : {}), ...(scope && scope !== 'all' ? { scope } : {}) },
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
    if (order.status === 'paid' && info.provider !== undefined) {
      this.notify.orderPaid(order).catch((e) => this.log.warn(`notify paid failed: ${e instanceof Error ? e.message : e}`));
      background(events.emit('order.paid', { id: order.id, merchantOrderNo: order.merchantOrderNo, userId: order.userId, amount: order.amount, scope: order.scope, provider: order.provider, items: order.items.map((i) => ({ productId: i.productId, name: i.name, qty: i.qty, unitPrice: i.unitPrice })) }));
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
    const o = await this.prisma.order.update({ where: { id: orderId }, data: { virtualAccount, expireAt, providerTradeNo: tradeNo, paymentType: 'VACC' }, include: ORDER_INCLUDE });
    background(this.notify.virtualAccountIssued(o));
    return o;
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
    background(this.invoice.invalidateForOrder(orderId));
    if (order.status === 'refunded') {
      background(this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE }).then((full) => (full ? this.notify.orderRefunded(full) : undefined)));
      background(events.emit('order.refunded', { id: order.id, merchantOrderNo: order.merchantOrderNo, userId: order.userId, amount: order.amount, scope: order.scope }));
    }
    return order;
  }

  /** 物流狀態：只有已付款且需出貨的訂單可更新。 */
  async updateShipping(idOrNo: string, input: unknown) {
    const d = shippingUpdate.parse(input);
    const o = await this.findByIdOrNo(idOrNo);
    if (!o.shippingStatus) throw new BadRequestException('this order has no shipping');
    if (o.status !== 'paid' && d.status !== 'returned') throw new BadRequestException(`order is ${o.status}; ship only paid orders`);
    const updated = await this.prisma.order.update({
      where: { id: o.id },
      data: { shippingStatus: d.status, ...(d.carrier !== undefined ? { carrier: d.carrier } : {}), ...(d.trackingNo !== undefined ? { trackingNo: d.trackingNo } : {}), ...(d.status === 'shipped' && !o.shippedAt ? { shippedAt: new Date() } : {}) },
      include: ORDER_INCLUDE,
    });
    if ((d.status === 'shipped' || d.status === 'delivered') && o.shippingStatus !== d.status) {
      background(this.notify.orderShipped(updated));
      background(events.emit('order.shipped', { id: updated.id, merchantOrderNo: updated.merchantOrderNo, userId: updated.userId, shippingStatus: updated.shippingStatus, carrier: updated.carrier, trackingNo: updated.trackingNo }));
    }
    return updated;
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

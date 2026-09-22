import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';

const reportInput = z.object({
  scope: z.enum(['shop', 'course', 'all']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  groupBy: z.enum(['day', 'month']).default('day'),
});

const tpe = (d: Date) => new Date(d.getTime() + 8 * 3600_000); // 以台北時間分桶
const dayKey = (d: Date) => tpe(d).toISOString().slice(0, 10);
const monthKey = (d: Date) => tpe(d).toISOString().slice(0, 7);

/** 進階報表：以已付款訂單（paidAt 落在期間）為準；退款另計。對帳檔＝訂單逐筆 CSV。 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private range(raw: unknown) {
    const p = reportInput.parse(raw ?? {});
    const to = p.to ? new Date(p.to) : new Date();
    const from = p.from ? new Date(p.from) : new Date(to.getTime() - 30 * 86_400_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error('invalid from/to');
    return { from, to: p.to && p.to.length <= 10 ? new Date(to.getTime() + 86_400_000) : to, groupBy: p.groupBy };
  }

  async sales(raw: unknown) {
    const { from, to, groupBy } = this.range(raw);
    const scopeRaw = (raw as { scope?: string } | undefined)?.scope;
    const scope = scopeRaw && scopeRaw !== 'all' ? { scope: scopeRaw } : {};
    const [paid, refunded, pendingCount] = await Promise.all([
      this.prisma.order.findMany({ where: { ...scope, status: { in: ['paid', 'refunded'] }, paidAt: { gte: from, lt: to } }, include: { items: true }, orderBy: { paidAt: 'asc' } }),
      this.prisma.order.findMany({ where: { ...scope, status: 'refunded', refundedAt: { gte: from, lt: to } }, select: { amount: true } }),
      this.prisma.order.count({ where: { ...scope, status: 'pending', createdAt: { gte: from, lt: to } } }),
    ]);
    const key = groupBy === 'month' ? monthKey : dayKey;
    const series = new Map<string, { revenue: number; orders: number }>();
    const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
    const byProvider = new Map<string, { orders: number; revenue: number }>();
    let revenue = 0;
    let discount = 0;
    let shipping = 0;
    for (const o of paid) {
      revenue += o.amount;
      discount += o.discount;
      shipping += o.shippingFee;
      const k = key(o.paidAt ?? o.createdAt);
      const s = series.get(k) ?? { revenue: 0, orders: 0 };
      s.revenue += o.amount;
      s.orders += 1;
      series.set(k, s);
      const pv = byProvider.get(o.provider ?? 'unknown') ?? { orders: 0, revenue: 0 };
      pv.orders += 1;
      pv.revenue += o.amount;
      byProvider.set(o.provider ?? 'unknown', pv);
      for (const i of o.items) {
        const bp = byProduct.get(i.productId) ?? { name: i.name, qty: 0, revenue: 0 };
        bp.qty += i.qty;
        bp.revenue += i.unitPrice * i.qty;
        byProduct.set(i.productId, bp);
      }
    }
    const refundTotal = refunded.reduce((s, o) => s + o.amount, 0);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      groupBy,
      summary: { orders: paid.length, revenue, netRevenue: revenue - refundTotal, discount, shipping, refunds: refunded.length, refundTotal, avgOrderValue: paid.length ? Math.round(revenue / paid.length) : 0, pendingOrders: pendingCount },
      series: [...series.entries()].map(([period, v]) => ({ period, ...v })),
      byProduct: [...byProduct.entries()].map(([productId, v]) => ({ productId, ...v })).sort((a, b) => b.revenue - a.revenue),
      byProvider: [...byProvider.entries()].map(([provider, v]) => ({ provider, ...v })),
    };
  }

  /** 對帳檔 CSV（UTF-8 BOM，Excel 可直開）：每筆訂單一列。 */
  async ordersCsv(raw: unknown & { status?: string }) {
    const { from, to } = this.range(raw);
    const status = (raw as { status?: string })?.status;
    const scopeRaw = (raw as { scope?: string })?.scope;
    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: from, lt: to }, ...(status ? { status: status as 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled' } : {}), ...(scopeRaw && scopeRaw !== 'all' ? { scope: scopeRaw } : {}) },
      include: { items: true, user: { select: { email: true } }, invoices: { select: { number: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : v instanceof Date ? tpe(v).toISOString().replace('T', ' ').slice(0, 19) : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = ['訂單編號', '建立時間', '付款時間', '狀態', '買家', '品項', '小計', '折扣', '折扣碼', '運費', '應付', '金流', '交易序號', '付款方式', '發票號碼', '物流狀態', '物流商', '追蹤碼', '收件人', '電話', '地址'];
    const rows = orders.map((o) => [o.merchantOrderNo, o.createdAt, o.paidAt, o.status, o.user.email, o.items.map((i) => `${i.name}x${i.qty}`).join('; '), o.subtotal || o.amount, o.discount, o.couponCode, o.shippingFee, o.amount, o.provider, o.providerTradeNo, o.paymentType, o.invoices[0]?.number, o.shippingStatus, o.carrier, o.trackingNo, o.shippingName, o.shippingPhone, o.shippingAddress].map(esc).join(','));
    return '﻿' + [head.join(','), ...rows].join('\r\n');
  }
}

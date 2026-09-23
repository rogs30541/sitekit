import { BadRequestException, Injectable, NotFoundException } from '../../compat';
import { COUPON_TYPES } from '@sitekit/shared';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const couponInput = z.object({
  code: z.string().trim().min(2).max(40).transform((s) => s.toUpperCase()),
  type: z.enum(COUPON_TYPES).default('percent'),
  value: z.number().int().min(1),
  minAmount: z.number().int().min(0).default(0),
  maxUses: z.number().int().min(1).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
  note: z.string().max(200).nullable().optional(),
  scope: z.enum(['shop', 'course', 'all']).default('shop'),
});

/** 折扣碼：驗證（有效期／次數／低消）與折扣計算；usedCount 只在 markPaid 累加。 */
@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaClient) {}

  list(scope?: string) {
    return this.prisma.coupon.findMany({ where: scope && scope !== 'all' ? { scope: { in: [scope, 'all'] } } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  create(input: unknown) {
    const d = couponInput.parse(input);
    if (d.type === 'percent' && d.value > 100) throw new BadRequestException('percent value must be 1-100');
    return this.prisma.coupon.create({ data: { ...d, startsAt: d.startsAt ? new Date(d.startsAt) : null, expiresAt: d.expiresAt ? new Date(d.expiresAt) : null } });
  }

  async update(idOrCode: string, input: unknown) {
    const c = await this.find(idOrCode);
    const d = couponInput.partial().parse(input);
    return this.prisma.coupon.update({
      where: { id: c.id },
      data: { ...d, ...(d.startsAt !== undefined ? { startsAt: d.startsAt ? new Date(d.startsAt) : null } : {}), ...(d.expiresAt !== undefined ? { expiresAt: d.expiresAt ? new Date(d.expiresAt) : null } : {}) },
    });
  }

  async find(idOrCode: string) {
    const c = await this.prisma.coupon.findFirst({ where: { OR: [{ id: idOrCode }, { code: idOrCode.toUpperCase() }] } });
    if (!c) throw new NotFoundException('coupon not found');
    return c;
  }

  /** 回傳折扣金額；不可用時丟 BadRequest（訊息給前端顯示）。 */
  async evaluate(code: string, subtotal: number, scope: 'shop' | 'course' = 'shop'): Promise<{ code: string; discount: number }> {
    const c = await this.prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
    const now = Date.now();
    if (!c || !c.isActive) throw new BadRequestException('折扣碼不存在或已停用');
    if (c.scope !== 'all' && c.scope !== scope) throw new BadRequestException(scope === 'course' ? '此折扣碼僅適用於商品訂單' : '此折扣碼僅適用於課程訂單');
    if (c.startsAt && c.startsAt.getTime() > now) throw new BadRequestException('折扣碼尚未開始');
    if (c.expiresAt && c.expiresAt.getTime() < now) throw new BadRequestException('折扣碼已過期');
    if (c.maxUses !== null && c.usedCount >= c.maxUses) throw new BadRequestException('折扣碼已達使用上限');
    if (subtotal < c.minAmount) throw new BadRequestException(`需消費滿 NT$ ${c.minAmount} 才可使用`);
    const discount = c.type === 'percent' ? Math.floor((subtotal * c.value) / 100) : Math.min(c.value, subtotal);
    return { code: c.code, discount };
  }

  /** 付款成功時累加使用次數（冪等由呼叫端的 markPaid 保證只進一次）。 */
  async consume(code: string) {
    await this.prisma.coupon.updateMany({ where: { code }, data: { usedCount: { increment: 1 } } });
  }
}

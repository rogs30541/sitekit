import { BadRequestException, Injectable, NotFoundException } from '../../compat';
import type { MemberTag } from '@sitekit/shared';
import { PrismaClient } from '@prisma/client';

/** 系統帳號（後台產圖任務掛載用），不列入會員資料庫也不可刪 */
const SYSTEM_EMAILS = new Set(['admin-studio@system.local']);

export interface MemberRow {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  membershipTier: string | null;
  createdAt: Date;
  tags: MemberTag[];
  shopOrders: number;
  courseOrders: number;
  courses: number;
  lastOrderAt: Date | null;
}

/**
 * 會員資料庫：前台會員（users）＋自動標籤。
 * - 電商客戶＝有已付款的電商（scope shop）訂單
 * - 課程學員＝有已付款課程（scope course）訂單，或持有課程商品的 entitlement
 * 兩者皆有＝兩個標籤。
 */
@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(opts: { q?: string; tag?: string; limit?: number; includeDeleted?: boolean }): Promise<MemberRow[]> {
    const take = Math.min(Math.max(Number(opts.limit) || 200, 1), 1000);
    const q = (opts.q ?? '').trim();
    const users = await this.prisma.user.findMany({
      where: {
        ...(opts.includeDeleted ? {} : { status: { not: 'deleted' } }),
        ...(q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { displayName: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, email: true, displayName: true, status: true, membershipTier: true, createdAt: true },
    });
    const ids = users.map((u) => u.id).filter((id, i) => !SYSTEM_EMAILS.has(users[i].email));
    const [orders, ents] = await Promise.all([
      this.prisma.order.groupBy({ by: ['userId', 'scope'], where: { userId: { in: ids }, status: { in: ['paid', 'refunded'] } }, _count: { _all: true }, _max: { createdAt: true } }),
      this.prisma.entitlement.findMany({ where: { userId: { in: ids }, product: { type: 'course' } }, select: { userId: true, productId: true } }),
    ]);
    const shop = new Map<string, number>();
    const course = new Map<string, number>();
    const last = new Map<string, Date>();
    for (const o of orders) {
      (o.scope === 'course' ? course : shop).set(o.userId, o._count._all);
      const prev = last.get(o.userId);
      if (o._max.createdAt && (!prev || o._max.createdAt > prev)) last.set(o.userId, o._max.createdAt);
    }
    const courses = new Map<string, Set<string>>();
    for (const e of ents) courses.set(e.userId, (courses.get(e.userId) ?? new Set()).add(e.productId));
    const rows: MemberRow[] = users
      .filter((u) => !SYSTEM_EMAILS.has(u.email))
      .map((u) => {
        const tags: MemberTag[] = [];
        if ((shop.get(u.id) ?? 0) > 0) tags.push('shop');
        if ((course.get(u.id) ?? 0) > 0 || (courses.get(u.id)?.size ?? 0) > 0) tags.push('course');
        return { ...u, tags, shopOrders: shop.get(u.id) ?? 0, courseOrders: course.get(u.id) ?? 0, courses: courses.get(u.id)?.size ?? 0, lastOrderAt: last.get(u.id) ?? null };
      });
    const tag = opts.tag ?? '';
    if (tag === 'shop' || tag === 'course') return rows.filter((r) => r.tags.includes(tag));
    if (tag === 'both') return rows.filter((r) => r.tags.length === 2);
    if (tag === 'none') return rows.filter((r) => r.tags.length === 0);
    return rows;
  }

  /** 刪除：有交易紀錄（訂單／點數帳）者匿名化＋停用（保留訂單、撤銷課程權限）；無交易者硬刪 */
  async remove(idOrEmail: string, actor: string): Promise<{ id: string; email: string; mode: 'deleted' | 'anonymized' }> {
    const key = idOrEmail.trim();
    if (!key) throw new BadRequestException('idOrEmail is required');
    const u = await this.prisma.user.findFirst({ where: { OR: [{ id: key }, { email: key }] } });
    if (!u) throw new NotFoundException('member not found');
    if (SYSTEM_EMAILS.has(u.email)) throw new BadRequestException('系統帳號不可刪除');
    const [orders, ledger, jobs] = await Promise.all([this.prisma.order.count({ where: { userId: u.id } }), this.prisma.creditLedger.count({ where: { userId: u.id } }), this.prisma.aiJob.count({ where: { userId: u.id } })]);
    const hasHistory = orders > 0 || ledger > 0 || jobs > 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.entitlement.deleteMany({ where: { userId: u.id } });
      await tx.session.deleteMany({ where: { userId: u.id } });
      await tx.identity.deleteMany({ where: { userId: u.id } });
      await tx.userApiKey.deleteMany({ where: { userId: u.id } });
      await tx.passwordReset.deleteMany({ where: { userId: u.id } });
      await tx.chapterProgress.deleteMany({ where: { userId: u.id } });
      await tx.courseQuestion.deleteMany({ where: { userId: u.id } });
      if (hasHistory) {
        await tx.user.update({ where: { id: u.id }, data: { status: 'deleted', email: `deleted+${u.id}@deleted.local`, passwordHash: null, displayName: null, allowedFeatures: [], creditBalance: 0, creditReserved: 0 } });
      } else {
        await tx.user.delete({ where: { id: u.id } });
      }
      await tx.auditLog.create({ data: { actor, action: 'delete_member', params: { id: u.id, email: u.email }, ok: true, result: { mode: hasHistory ? 'anonymized' : 'deleted', orders, ledger, jobs } } });
    });
    return { id: u.id, email: u.email, mode: hasHistory ? 'anonymized' : 'deleted' };
  }

  async removeMany(ids: string[], actor: string) {
    const out: { id: string; email?: string; mode?: string; error?: string }[] = [];
    for (const id of ids) {
      try {
        out.push(await this.remove(id, actor));
      } catch (e) {
        out.push({ id, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  }
}

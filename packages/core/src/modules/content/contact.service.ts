import { BadRequestException, Injectable, NotFoundException } from '../../compat';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { background } from '../../env';
import { events } from '../../plugins';
import { NotifyService } from '../notify/notify.service';

/**
 * 前台「聯絡表單」（contact 區塊 showForm=true）→ 後台「表單訊息」／OPS list_contact_messages／MCP。
 * 送出：驗證＋簡易防灌水（同 email 60 秒內只收一筆、蜜罐欄位）→ 存 contact_messages → 通知站主（mail.adminTo）→ 事件 contact.submitted（外掛可接）。
 */
const submitInput = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().default(''),
  subject: z.string().trim().max(120).optional().default(''),
  message: z.string().trim().min(1).max(4000),
  page: z.string().trim().max(200).optional().default(''),
  /** 蜜罐：機器人會填、真人看不到 */
  website: z.string().max(200).optional().default(''),
});
export type ContactSubmit = z.infer<typeof submitInput>;
export const CONTACT_STATUSES = ['new', 'read', 'replied', 'archived'] as const;

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notify: NotifyService,
  ) {}

  async submit(input: unknown, meta: { ip?: string; userAgent?: string } = {}) {
    const d = submitInput.parse(input);
    if (d.website) return { ok: true, id: '' }; // 蜜罐命中：假裝成功、不存
    const recent = await this.prisma.contactMessage.findFirst({ where: { email: d.email.toLowerCase(), createdAt: { gt: new Date(Date.now() - 60_000) } }, select: { id: true } });
    if (recent) throw new BadRequestException('送出太頻繁，請稍後再試');
    const m = await this.prisma.contactMessage.create({ data: { name: d.name, email: d.email.toLowerCase(), phone: d.phone || null, subject: d.subject || null, message: d.message, page: d.page || null, ip: meta.ip?.slice(0, 64) || null, userAgent: meta.userAgent?.slice(0, 300) || null } });
    background(this.notify.contactMessage({ id: m.id, name: m.name, email: m.email, phone: m.phone, subject: m.subject, message: m.message, page: m.page }));
    background(events.emit('contact.submitted', { id: m.id, name: m.name, email: m.email, subject: m.subject, page: m.page, createdAt: m.createdAt.toISOString() }));
    return { ok: true, id: m.id };
  }

  list(opts: { status?: string; limit?: number } = {}) {
    const status = opts.status && (CONTACT_STATUSES as readonly string[]).includes(opts.status) ? opts.status : undefined;
    return this.prisma.contactMessage.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(opts.limit ?? 200, 1), 1000) });
  }

  async counts() {
    const rows = await this.prisma.contactMessage.groupBy({ by: ['status'], _count: { _all: true } });
    const out: Record<string, number> = { new: 0, read: 0, replied: 0, archived: 0 };
    for (const r of rows) out[r.status] = r._count._all;
    return out;
  }

  async update(id: string, patch: { status?: string; note?: string }, actor: string) {
    const m = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('message not found');
    if (patch.status !== undefined && !(CONTACT_STATUSES as readonly string[]).includes(patch.status)) throw new BadRequestException(`status 需為 ${CONTACT_STATUSES.join('|')}`);
    return this.prisma.contactMessage.update({ where: { id }, data: { ...(patch.status !== undefined ? { status: patch.status, ...(patch.status === 'replied' ? { repliedAt: new Date(), repliedBy: actor } : {}) } : {}), ...(patch.note !== undefined ? { note: patch.note.slice(0, 2000) } : {}) } });
  }

  async remove(id: string) {
    const m = await this.prisma.contactMessage.findUnique({ where: { id }, select: { id: true } });
    if (!m) throw new NotFoundException('message not found');
    await this.prisma.contactMessage.delete({ where: { id } });
    return { deleted: true, id };
  }
}

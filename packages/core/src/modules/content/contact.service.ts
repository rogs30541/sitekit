import { BadRequestException, Injectable, NotFoundException } from '../../compat';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { background } from '../../env';
import { events } from '../../plugins';
import { NotifyService } from '../notify/notify.service';
import { SettingsService } from '../settings/settings.service';
import { TextGenService } from '../admin-ai/textgen.service';

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
    private readonly settings: SettingsService,
    private readonly textgen: TextGenService,
  ) {}

  async submit(input: unknown, meta: { ip?: string; userAgent?: string } = {}) {
    const d = submitInput.parse(input);
    if (d.website) return { ok: true, id: '' }; // 蜜罐命中：假裝成功、不存
    const recent = await this.prisma.contactMessage.findFirst({ where: { email: d.email.toLowerCase(), createdAt: { gt: new Date(Date.now() - 60_000) } }, select: { id: true } });
    if (recent) throw new BadRequestException('送出太頻繁，請稍後再試');
    const m = await this.prisma.contactMessage.create({ data: { name: d.name, email: d.email.toLowerCase(), phone: d.phone || null, subject: d.subject || null, message: d.message, page: d.page || null, ip: meta.ip?.slice(0, 64) || null, userAgent: meta.userAgent?.slice(0, 300) || null } });
    background(this.notify.contactMessage({ id: m.id, name: m.name, email: m.email, phone: m.phone, subject: m.subject, message: m.message, page: m.page }));
    background(this.notify.contactAutoreply({ name: m.name, email: m.email, subject: m.subject, message: m.message }));
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

  /** 回覆訪客：走「聯絡表單回覆」範本寄信，成功才標 replied 並存回覆 */
  async reply(id: string, input: { reply: string; subject?: string }, actor: string) {
    const m = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('message not found');
    const text = String(input.reply ?? '').trim();
    if (!text) throw new BadRequestException('reply is required');
    const r = await this.notify.contactReply({ name: m.name, email: m.email, subject: m.subject, message: m.message }, text.slice(0, 5000), input.subject);
    if (!r.ok) throw new BadRequestException(`寄信失敗：${r.error ?? r.skipped ?? 'unknown'}`);
    const updated = await this.prisma.contactMessage.update({ where: { id }, data: { status: 'replied', reply: text.slice(0, 5000), repliedAt: new Date(), repliedBy: actor } });
    return { ...updated, mail: r };
  }

  /**
   * AI 擬回覆草稿（不寄信、不改狀態）：只用「訪客原訊息＋站主給的要點＋網站名稱」，不知道的事實寫成【請補充：…】，不杜撰。
   * 供應商走指令台同一組設定；mock／未設金鑰時用規則模板產生。回 draft 給後台回覆框或指令台接 reply_contact_message。
   */
  async draftReply(id: string, opts: { tone?: string; points?: string } = {}) {
    const m = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('message not found');
    const siteName = (await this.settings.get('brand.name')) || (await this.settings.get('brand.siteName')) || 'SiteKit';
    const tone = String(opts.tone ?? '').trim().slice(0, 40) || '親切、專業';
    const points = String(opts.points ?? '').trim().slice(0, 2000);
    const subject = `Re: ${m.subject || '您的來信'}`;
    const cfg = await this.textgen.config();
    if (cfg.provider !== 'mock' && cfg.ready) {
      const system = `你是網站「${siteName}」的客服，替站主草擬回覆訪客來信的內文（純文字、繁體中文、3–6 句、語氣${tone}）。
規則：只能使用「訪客原訊息」與「站主要點」裡的資料；價格、日期、方案細節、名額等任何未提供的事實，一律寫成【請補充：…】佔位，絕不自行編造。不要主旨行、不要 Markdown、不要多餘說明；開頭稱呼訪客姓名，結尾署名「${siteName}」。`;
      const user = `訪客姓名：${m.name}
原主旨：${m.subject || '（無）'}
原訊息：
${m.message}

站主要點：${points || '（未提供；不知道的地方用【請補充：…】）'}`;
      const r = await this.textgen.complete({ system, user, maxTokens: 1024 });
      if (r.text) return { id: m.id, draft: r.text.slice(0, 5000), subject, provider: r.provider, model: r.model, mock: false, tone, points };
    }
    const firstLine = m.message.replace(/\s+/g, ' ').trim().slice(0, 60);
    const draft = `${m.name} 您好：

感謝您來信${m.subject ? `詢問「${m.subject}」` : ''}。關於您提到的「${firstLine}${m.message.trim().length > 60 ? '…' : ''}」，${points || '【請補充：具體回覆內容】'}

若還有其他問題，歡迎直接回覆此信，我們會盡快協助。

${siteName} 敬上`;
    return { id: m.id, draft, subject, provider: 'mock', model: 'rules', mock: true, tone, points };
  }

  async remove(id: string) {
    const m = await this.prisma.contactMessage.findUnique({ where: { id }, select: { id: true } });
    if (!m) throw new NotFoundException('message not found');
    await this.prisma.contactMessage.delete({ where: { id } });
    return { deleted: true, id };
  }
}

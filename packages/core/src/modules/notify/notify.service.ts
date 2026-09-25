import { Injectable, Logger } from '../../compat';
import { MAIL_KINDS, SETTING_KEYS, SHIPPING_LABELS, renderMailTemplate, resolveMailTemplate, sampleMailVars, type MailTemplate, type ShippingStatus } from '@sitekit/shared';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text?: string;
}
export interface NotifyResult {
  channel: 'email' | 'line';
  provider: string;
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: string;
}

interface OrderLike {
  merchantOrderNo: string;
  amount: number;
  items: { name: string; qty: number }[];
  user: { email: string; displayName: string | null };
  virtualAccount?: string | null;
  expireAt?: Date | null;
  carrier?: string | null;
  trackingNo?: string | null;
  shippingStatus?: string | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
const twd = (n: number) => `NT$ ${n.toLocaleString('zh-TW')}`;

/**
 * 通知中心：Email（provider＝log｜resend）＋ LINE Messaging API 推播（管理員）。
 * 一律 best-effort：失敗只記 log，不影響訂單狀態機。設定全部走 settings（後台／MCP update_settings 可改）。
 */
@Injectable()
export class NotifyService {
  private readonly log = new Logger(NotifyService.name);
  /** 最近 50 筆送出紀錄（除錯／後台顯示；不落地） */
  readonly recent: { at: string; kind: string; to: string; result: NotifyResult }[] = [];

  constructor(
    private readonly settings: SettingsService,
    private readonly prisma: PrismaClient,
  ) {}

  async config() {
    const [emailProvider, resendApiKey, from, adminTo, lineToken, lineAdminUserId, site] = await Promise.all([
      this.settings.get(SETTING_KEYS.notifyEmailProvider, 'NOTIFY_EMAIL_PROVIDER', 'log'),
      this.settings.get(SETTING_KEYS.resendApiKey, 'RESEND_API_KEY'),
      this.settings.get(SETTING_KEYS.mailFrom, 'MAIL_FROM'),
      this.settings.get(SETTING_KEYS.mailAdminTo, 'MAIL_ADMIN_TO'),
      this.settings.get(SETTING_KEYS.lineChannelToken, 'LINE_CHANNEL_TOKEN'),
      this.settings.get(SETTING_KEYS.lineAdminUserId, 'LINE_ADMIN_USER_ID'),
      this.settings.siteUrl(),
    ]);
    return { emailProvider: emailProvider === 'resend' && resendApiKey && from ? 'resend' : 'log', resendConfigured: !!(resendApiKey && from), resendApiKey, from, adminTo, lineConfigured: !!(lineToken && lineAdminUserId), lineToken, lineAdminUserId, site };
  }

  /** 站主覆寫的信件範本（settings mail.templates JSON） */
  async templates(): Promise<Record<string, Partial<MailTemplate>>> {
    try {
      const raw = await this.settings.get(SETTING_KEYS.mailTemplates, 'MAIL_TEMPLATES', '');
      const o = raw ? (JSON.parse(raw) as Record<string, Partial<MailTemplate>>) : {};
      return o && typeof o === 'object' ? o : {};
    } catch {
      return {};
    }
  }
  /** 用範本（覆寫或預設）組信；回 null＝該種類被關閉（自動回覆） */
  async compose(kind: string, vars: Record<string, string | number | null | undefined>): Promise<{ subject: string; html: string } | null> {
    const t = resolveMailTemplate(kind, await this.templates());
    if (!t.enabled) return null;
    const cfg = await this.config();
    const siteName = await this.settings.get(SETTING_KEYS.brandSiteName, 'BRAND_SITE_NAME', '');
    const r = renderMailTemplate(t, { siteName: siteName || cfg.site, siteUrl: cfg.site, ...vars });
    return { subject: r.subject, html: this.layout(r.subject, r.html, cfg.site) };
  }
  /** 後台／OPS：列出範本（含是否自訂） */
  async listTemplates() {
    const o = await this.templates();
    return MAIL_KINDS.map((k) => {
      const t = resolveMailTemplate(k.kind, o);
      return { kind: k.kind, label: k.label, desc: k.desc, to: k.to, optional: !!k.optional, vars: k.vars, subject: t.subject, body: t.body, enabled: t.enabled, customized: t.customized, defaultSubject: k.subject, defaultBody: k.body };
    });
  }
  async setTemplate(kind: string, patch: { subject?: string; body?: string; enabled?: boolean; reset?: boolean }) {
    if (!MAIL_KINDS.some((k) => k.kind === kind)) throw new Error(`unknown mail kind: ${kind}`);
    const o = await this.templates();
    if (patch.reset) delete o[kind];
    else {
      const cur = o[kind] ?? {};
      o[kind] = { ...cur, ...(patch.subject !== undefined ? { subject: String(patch.subject).slice(0, 300) } : {}), ...(patch.body !== undefined ? { body: String(patch.body).slice(0, 20000) } : {}), ...(patch.enabled !== undefined ? { enabled: !!patch.enabled } : {}) };
    }
    await this.prisma.setting.upsert({ where: { key: SETTING_KEYS.mailTemplates }, update: { value: JSON.stringify(o) }, create: { key: SETTING_KEYS.mailTemplates, value: JSON.stringify(o), isSecret: false } });
    this.settings.invalidate();
    return (await this.listTemplates()).find((t) => t.kind === kind);
  }
  async previewTemplate(kind: string, draft?: { subject?: string; body?: string }) {
    const cfg = await this.config();
    const siteName = await this.settings.get(SETTING_KEYS.brandSiteName, 'BRAND_SITE_NAME', '');
    const t = resolveMailTemplate(kind, await this.templates());
    const r = renderMailTemplate({ subject: draft?.subject?.trim() ? draft.subject : t.subject, body: draft?.body?.trim() ? draft.body : t.body }, sampleMailVars(kind, { siteName: siteName || 'SiteKit', siteUrl: cfg.site }));
    return { kind, subject: r.subject, html: this.layout(r.subject, r.html, cfg.site) };
  }
  private async sendKind(kind: string, to: string, vars: Record<string, string | number | null | undefined>): Promise<NotifyResult> {
    const m = await this.compose(kind, vars);
    if (!m) {
      const r: NotifyResult = { channel: 'email', provider: 'log', ok: false, skipped: `${kind} disabled` };
      this.remember(kind, to, r);
      return r;
    }
    return this.sendMail(kind, { to, ...m });
  }

  private remember(kind: string, to: string, result: NotifyResult) {
    this.recent.unshift({ at: new Date().toISOString(), kind, to, result });
    if (this.recent.length > 50) this.recent.length = 50;
    if (!result.ok && !result.skipped) this.log.warn(`${kind} → ${to} failed: ${result.error}`);
  }

  async sendMail(kind: string, mail: Mail): Promise<NotifyResult> {
    const cfg = await this.config();
    let result: NotifyResult;
    if (cfg.emailProvider === 'resend') {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${cfg.resendApiKey}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: cfg.from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
          signal: AbortSignal.timeout(15_000),
        });
        const j = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
        result = res.ok ? { channel: 'email', provider: 'resend', ok: true, id: j.id } : { channel: 'email', provider: 'resend', ok: false, error: `${res.status} ${j.message ?? j.name ?? ''}`.trim() };
      } catch (e) {
        result = { channel: 'email', provider: 'resend', ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    } else {
      this.log.log(`[mail:log] to=${mail.to} subject=${mail.subject}`);
      result = { channel: 'email', provider: 'log', ok: true, id: `log-${Date.now()}` };
    }
    this.remember(kind, mail.to, result);
    return result;
  }

  /** LINE Messaging API push（給管理員；需 channel access token＋管理員 userId） */
  async pushLine(kind: string, text: string, to?: string): Promise<NotifyResult> {
    const cfg = await this.config();
    const target = to ?? cfg.lineAdminUserId;
    if (!cfg.lineToken || !target) {
      const r: NotifyResult = { channel: 'line', provider: 'line', ok: false, skipped: 'line not configured' };
      this.remember(kind, target || '-', r);
      return r;
    }
    let result: NotifyResult;
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.lineToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ to: target, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
        signal: AbortSignal.timeout(15_000),
      });
      result = res.ok ? { channel: 'line', provider: 'line', ok: true } : { channel: 'line', provider: 'line', ok: false, error: `${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}` };
    } catch (e) {
      result = { channel: 'line', provider: 'line', ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    this.remember(kind, target, result);
    return result;
  }

  // ---- 事件模板（呼叫端 fire-and-forget） ----

  private layout(title: string, body: string, site: string) {
    return `<div style="font-family:system-ui,-apple-system,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111"><h2 style="margin:0 0 16px">${esc(title)}</h2>${body}<p style="margin-top:24px;font-size:12px;color:#666"><a href="${esc(site)}">${esc(site)}</a></p></div>`;
  }
  private itemsHtml(o: OrderLike) {
    return `<ul>${o.items.map((i) => `<li>${esc(i.name)} × ${i.qty}</li>`).join('')}</ul><p>訂單編號 <code>${esc(o.merchantOrderNo)}</code>，金額 <strong>${twd(o.amount)}</strong></p>`;
  }

  private orderVars(o: OrderLike) {
    return { name: o.user.displayName ?? o.user.email, email: o.user.email, orderNo: o.merchantOrderNo, amount: twd(o.amount), itemsHtml: this.itemsHtml(o) };
  }
  async orderPaid(o: OrderLike) {
    const { adminTo } = await this.config();
    await this.sendKind('order_paid', o.user.email, this.orderVars(o));
    const summary = `💰 新訂單已付款\n${o.merchantOrderNo}\n${o.items.map((i) => `${i.name}×${i.qty}`).join('、')}\n${twd(o.amount)}\n${o.user.email}`;
    await this.pushLine('order_paid_admin', summary);
    if (adminTo) await this.sendKind('order_paid_admin', adminTo, { ...this.orderVars(o), shippingNote: o.shippingStatus ? '<p>此訂單需要出貨。</p>' : '' });
  }

  async virtualAccountIssued(o: OrderLike) {
    const exp = o.expireAt ? new Date(o.expireAt.getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '';
    await this.sendKind('vacc_issued', o.user.email, { ...this.orderVars(o), virtualAccount: o.virtualAccount ?? '', expireAt: exp });
  }

  async orderShipped(o: OrderLike) {
    const status = SHIPPING_LABELS[(o.shippingStatus ?? 'shipped') as ShippingStatus] ?? o.shippingStatus ?? '';
    await this.sendKind('order_shipped', o.user.email, { ...this.orderVars(o), status, carrier: o.carrier ?? '', trackingNo: o.trackingNo ?? '' });
  }

  async orderRefunded(o: OrderLike) {
    await this.sendKind('order_refunded', o.user.email, this.orderVars(o));
  }

  async welcome(email: string, displayName: string | null) {
    await this.sendKind('welcome', email, { name: displayName ?? email, email });
  }

  async newQuestion(i: { courseName: string; question: string; from: string; courseId: string }) {
    const { adminTo, site } = await this.config();
    await this.pushLine('new_question', `❓ 新提問「${i.courseName}」\n${i.question.slice(0, 300)}\n— ${i.from}`);
    if (adminTo) await this.sendKind('new_question', adminTo, { courseName: i.courseName, question: i.question, from: i.from, adminUrl: `${site}/admin/courses/${i.courseId}` });
  }

  async questionAnswered(i: { to: string; name: string | null; courseName: string; slug: string; question: string; answer: string }) {
    const { site } = await this.config();
    await this.sendKind('question_answered', i.to, { name: i.name ?? i.to, courseName: i.courseName, question: i.question, answerHtml: esc(i.answer).replace(/\n/g, '<br>'), classroomUrl: `${site}/classroom/${i.slug}` });
  }

  /** 前台聯絡表單 → 站主（mail.adminTo）；沒設收件人就略過 */
  async contactMessage(m: { id: string; name: string; email: string; phone: string | null; subject: string | null; message: string; page: string | null }) {
    const { site, adminTo } = await this.config();
    if (!adminTo) return { channel: 'email' as const, provider: 'log', ok: false, skipped: 'no recipient (set mail.adminTo)' };
    return this.sendKind('contact_message', adminTo, { name: m.name, email: m.email, phone: m.phone ?? '', subject: m.subject || m.name, messageHtml: esc(m.message).replace(/\n/g, '<br>'), page: m.page ?? '', adminUrl: `${site}/admin/messages` });
  }
  /** 訪客自動回覆（範本可關閉；預設關） */
  async contactAutoreply(m: { name: string; email: string; subject: string | null; message: string }) {
    return this.sendKind('contact_autoreply', m.email, { name: m.name, subject: m.subject || '', messageHtml: esc(m.message).replace(/\n/g, '<br>') });
  }
  /** 站主回覆訪客 */
  async contactReply(m: { name: string; email: string; subject: string | null; message: string }, reply: string, subject?: string) {
    const vars = { name: m.name, subject: m.subject || '您的來信', messageHtml: esc(m.message).replace(/\n/g, '<br>'), replyHtml: esc(reply).replace(/\n/g, '<br>') };
    if (subject?.trim()) {
      const c = await this.compose('contact_reply', vars);
      if (!c) return { channel: 'email' as const, provider: 'log', ok: false, skipped: 'disabled' };
      return this.sendMail('contact_reply', { to: m.email, subject: subject.trim().slice(0, 300), html: c.html });
    }
    return this.sendKind('contact_reply', m.email, vars);
  }

  /** 後台／MCP 測試：送一封測試信與一則 LINE 推播 */
  async sendTest(to?: string) {
    const cfg = await this.config();
    const target = to || cfg.adminTo;
    const mail = target ? await this.sendMail('test', { to: target, subject: '【測試】通知中心', html: this.layout('通知中心測試', `<p>Email provider：${cfg.emailProvider}</p><p>時間：${new Date().toISOString()}</p>`, cfg.site) }) : { channel: 'email' as const, provider: cfg.emailProvider, ok: false, skipped: 'no recipient (pass to or set mail.adminTo)' };
    const line = await this.pushLine('test', `🔔 通知中心測試 ${new Date().toISOString()}`);
    return { emailProvider: cfg.emailProvider, mail, line };
  }
}

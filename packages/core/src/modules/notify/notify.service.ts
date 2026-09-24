import { Injectable, Logger } from '../../compat';
import { SETTING_KEYS, SHIPPING_LABELS, type ShippingStatus } from '@sitekit/shared';
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

  constructor(private readonly settings: SettingsService) {}

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

  private remember(kind: string, to: string, result: NotifyResult) {
    this.recent.unshift({ at: new Date().toISOString(), kind, to, result });
    if (this.recent.length > 50) this.recent.length = 50;
    if (!result.ok && !result.skipped) this.log.warn(`${kind} → ${to} failed: ${result.error}`);
  }

  /** 前台聯絡表單 → 站主（mail.adminTo）；沒設收件人就略過 */
  async contactMessage(m: { id: string; name: string; email: string; phone: string | null; subject: string | null; message: string; page: string | null }) {
    const { site, adminTo } = await this.config();
    if (!adminTo) return { channel: 'email' as const, provider: 'log', ok: false, skipped: 'no recipient (set mail.adminTo)' };
    const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
    return this.sendMail('contact_message', { to: adminTo, subject: `【聯絡表單】${m.subject || m.name}`, html: this.layout('新的聯絡表單訊息', `<p><strong>${esc(m.name)}</strong>（<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>${m.phone ? `，${esc(m.phone)}` : ''}）</p>${m.page ? `<p>來源頁：${esc(m.page)}</p>` : ''}<blockquote>${esc(m.message).replace(/\n/g, '<br>')}</blockquote><p><a href="${esc(site)}/admin/messages">前往後台查看</a></p>`, site) });
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

  async orderPaid(o: OrderLike) {
    const { site, adminTo } = await this.config();
    const name = o.user.displayName ?? o.user.email;
    await this.sendMail('order_paid', { to: o.user.email, subject: `【付款成功】訂單 ${o.merchantOrderNo}`, html: this.layout('付款成功，感謝您的購買', `<p>${esc(name)} 您好，我們已收到您的付款。</p>${this.itemsHtml(o)}<p><a href="${esc(site)}/member">前往會員中心</a></p>`, site) });
    const summary = `💰 新訂單已付款\n${o.merchantOrderNo}\n${o.items.map((i) => `${i.name}×${i.qty}`).join('、')}\n${twd(o.amount)}\n${o.user.email}`;
    await this.pushLine('order_paid_admin', summary);
    if (adminTo) await this.sendMail('order_paid_admin', { to: adminTo, subject: `【新訂單】${o.merchantOrderNo} ${twd(o.amount)}`, html: this.layout('新訂單已付款', `<p>${esc(o.user.email)}</p>${this.itemsHtml(o)}${o.shippingStatus ? '<p>此訂單需要出貨。</p>' : ''}`, site) });
  }

  async virtualAccountIssued(o: OrderLike) {
    const { site } = await this.config();
    const exp = o.expireAt ? new Date(o.expireAt.getTime() + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ') : '';
    await this.sendMail('vacc_issued', { to: o.user.email, subject: `【待付款】訂單 ${o.merchantOrderNo} 轉帳資訊`, html: this.layout('請於期限內完成轉帳', `${this.itemsHtml(o)}<p>轉帳帳號：<strong>${esc(o.virtualAccount ?? '')}</strong></p>${exp ? `<p>繳費期限：${esc(exp)}（台北時間）</p>` : ''}`, site) });
  }

  async orderShipped(o: OrderLike) {
    const { site } = await this.config();
    const status = SHIPPING_LABELS[(o.shippingStatus ?? 'shipped') as ShippingStatus] ?? o.shippingStatus ?? '';
    await this.sendMail('order_shipped', { to: o.user.email, subject: `【${status}】訂單 ${o.merchantOrderNo}`, html: this.layout(`訂單${status}`, `${this.itemsHtml(o)}${o.carrier ? `<p>物流：${esc(o.carrier)}</p>` : ''}${o.trackingNo ? `<p>追蹤碼：<strong>${esc(o.trackingNo)}</strong></p>` : ''}`, site) });
  }

  async orderRefunded(o: OrderLike) {
    const { site } = await this.config();
    await this.sendMail('order_refunded', { to: o.user.email, subject: `【已退款】訂單 ${o.merchantOrderNo}`, html: this.layout('退款已完成', `${this.itemsHtml(o)}<p>款項將依金流商作業時間退回原付款方式。</p>`, site) });
  }

  async welcome(email: string, displayName: string | null) {
    const { site } = await this.config();
    await this.sendMail('welcome', { to: email, subject: '歡迎加入', html: this.layout('歡迎加入', `<p>${esc(displayName ?? email)} 您好，您的帳號已建立。</p><p><a href="${esc(site)}/member">前往會員中心</a></p>`, site) });
  }

  async newQuestion(i: { courseName: string; question: string; from: string; courseId: string }) {
    const { adminTo, site } = await this.config();
    await this.pushLine('new_question', `❓ 新提問「${i.courseName}」\n${i.question.slice(0, 300)}\n— ${i.from}`);
    if (adminTo) await this.sendMail('new_question', { to: adminTo, subject: `【新提問】${i.courseName}`, html: this.layout('學員提問', `<p>${esc(i.from)}</p><blockquote>${esc(i.question)}</blockquote><p><a href="${esc(site)}/admin/courses/${esc(i.courseId)}">前往後台回覆</a></p>`, site) });
  }

  async questionAnswered(i: { to: string; name: string | null; courseName: string; slug: string; question: string; answer: string }) {
    const { site } = await this.config();
    await this.sendMail('question_answered', { to: i.to, subject: `【已回覆】${i.courseName}`, html: this.layout('您的提問已回覆', `<p>${esc(i.name ?? i.to)} 您好：</p><blockquote>${esc(i.question)}</blockquote><p><strong>回覆：</strong></p><p>${esc(i.answer).replace(/\n/g, '<br>')}</p><p><a href="${esc(site)}/classroom/${esc(i.slug)}">回到教室</a></p>`, site) });
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

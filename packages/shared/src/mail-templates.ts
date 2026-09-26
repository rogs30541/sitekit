/**
 * 信件範本：每種通知一份（主旨＋內文 HTML），內文用 {{變數}}（自動跳脫）或 {{{變數}}}（原樣 HTML，例如商品清單）。
 * 預設範本在此；站主在後台「信件範本」覆寫（settings `mail.templates` JSON：{ [kind]: { subject, body, enabled } }），reset 即回預設。
 */
export interface MailTemplate {
  subject: string;
  body: string;
  /** 只有可關閉的種類（自動回覆）才看這個旗標 */
  enabled?: boolean;
}
export interface MailKindDef {
  kind: string;
  label: string;
  desc: string;
  /** 收件對象 */
  to: '顧客' | '站主' | '訪客' | '管理員';
  vars: { key: string; label: string; html?: boolean }[];
  /** 可否由站主關閉（預設一律送） */
  optional?: boolean;
  defaultEnabled?: boolean;
  subject: string;
  body: string;
}

const common = [
  { key: 'siteName', label: '網站名稱' },
  { key: 'siteUrl', label: '網站網址' },
];
const orderVars = [
  ...common,
  { key: 'name', label: '顧客名稱' },
  { key: 'email', label: '顧客 Email' },
  { key: 'orderNo', label: '訂單編號' },
  { key: 'amount', label: '金額（NT$ 格式）' },
  { key: 'itemsHtml', label: '商品清單（HTML）', html: true },
];

export const MAIL_KINDS: MailKindDef[] = [
  { kind: 'admin_register', label: '管理員註冊驗證碼', desc: '後台「註冊管理員」寄 6 碼驗證碼（第一位管理員／主管理員 Email／白名單才會寄）', to: '管理員', vars: [...common, { key: 'email', label: '註冊 Email' }, { key: 'code', label: '6 碼驗證碼' }, { key: 'firstNote', label: '第一位管理員提示（HTML）', html: true }, { key: 'loginUrl', label: '登入頁連結' }], subject: '【後台管理員註冊】驗證碼 {{code}}', body: '<p>您的後台管理員註冊驗證碼：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">{{code}}</p><p>15 分鐘內有效。{{{firstNote}}}</p><p><a href="{{loginUrl}}">{{loginUrl}}</a></p>' },
  { kind: 'admin_password_reset', label: '管理員重設密碼驗證碼', desc: '後台登入頁「忘記密碼」寄 6 碼驗證碼給既有管理員', to: '管理員', vars: [...common, { key: 'email', label: '管理員 Email' }, { key: 'code', label: '6 碼驗證碼' }, { key: 'resetUrl', label: '重設密碼頁連結' }], subject: '【後台】重設密碼驗證碼 {{code}}', body: '<p>您申請了重設後台密碼，驗證碼：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">{{code}}</p><p>15 分鐘內有效；若不是您本人申請，請忽略此信。</p><p><a href="{{resetUrl}}">{{resetUrl}}</a></p>' },
  { kind: 'order_paid', label: '付款成功（顧客）', desc: '訂單付款完成後寄給顧客', to: '顧客', vars: orderVars, subject: '【付款成功】訂單 {{orderNo}}', body: '<p>{{name}} 您好，我們已收到您的付款。</p>{{{itemsHtml}}}<p><a href="{{siteUrl}}/member">前往會員中心</a></p>' },
  { kind: 'order_paid_admin', label: '新訂單通知（站主）', desc: '訂單付款完成後寄給站主', to: '站主', vars: [...orderVars, { key: 'shippingNote', label: '需要出貨提示（HTML）', html: true }], subject: '【新訂單】{{orderNo}} {{amount}}', body: '<p>{{email}}</p>{{{itemsHtml}}}{{{shippingNote}}}' },
  { kind: 'vacc_issued', label: 'ATM 虛擬帳號（顧客）', desc: '取得轉帳帳號後寄給顧客', to: '顧客', vars: [...orderVars, { key: 'virtualAccount', label: '轉帳帳號' }, { key: 'expireAt', label: '繳費期限' }], subject: '【待付款】訂單 {{orderNo}} 轉帳資訊', body: '{{{itemsHtml}}}<p>轉帳帳號：<strong>{{virtualAccount}}</strong></p><p>繳費期限：{{expireAt}}（台北時間）</p>' },
  { kind: 'order_shipped', label: '出貨／物流狀態（顧客）', desc: '訂單出貨、送達等狀態變更時寄給顧客', to: '顧客', vars: [...orderVars, { key: 'status', label: '狀態文字' }, { key: 'carrier', label: '物流商' }, { key: 'trackingNo', label: '追蹤碼' }], subject: '【{{status}}】訂單 {{orderNo}}', body: '{{{itemsHtml}}}<p>物流：{{carrier}}</p><p>追蹤碼：<strong>{{trackingNo}}</strong></p>' },
  { kind: 'order_refunded', label: '已退款（顧客）', desc: '退款完成後寄給顧客', to: '顧客', vars: orderVars, subject: '【已退款】訂單 {{orderNo}}', body: '{{{itemsHtml}}}<p>款項將依金流商作業時間退回原付款方式。</p>' },
  { kind: 'welcome', label: '歡迎加入（會員）', desc: '註冊完成後寄給會員', to: '顧客', vars: [...common, { key: 'name', label: '會員名稱' }, { key: 'email', label: '會員 Email' }], subject: '歡迎加入 {{siteName}}', body: '<p>{{name}} 您好，您的帳號已建立。</p><p><a href="{{siteUrl}}/member">前往會員中心</a></p>' },
  { kind: 'new_question', label: '學員提問通知（站主）', desc: '課程有新提問時寄給站主', to: '站主', vars: [...common, { key: 'courseName', label: '課程名稱' }, { key: 'question', label: '提問內容' }, { key: 'from', label: '提問者' }, { key: 'adminUrl', label: '後台回覆連結' }], subject: '【新提問】{{courseName}}', body: '<p>{{from}}</p><blockquote>{{question}}</blockquote><p><a href="{{adminUrl}}">前往後台回覆</a></p>' },
  { kind: 'question_answered', label: '提問已回覆（學員）', desc: '站主回覆後寄給學員', to: '顧客', vars: [...common, { key: 'name', label: '學員名稱' }, { key: 'courseName', label: '課程名稱' }, { key: 'question', label: '提問內容' }, { key: 'answerHtml', label: '回覆（HTML）', html: true }, { key: 'classroomUrl', label: '教室連結' }], subject: '【已回覆】{{courseName}}', body: '<p>{{name}} 您好：</p><blockquote>{{question}}</blockquote><p><strong>回覆：</strong></p><p>{{{answerHtml}}}</p><p><a href="{{classroomUrl}}">回到教室</a></p>' },
  { kind: 'contact_message', label: '聯絡表單通知（站主）', desc: '前台聯絡表單送出時寄給站主', to: '站主', vars: [...common, { key: 'name', label: '訪客姓名' }, { key: 'email', label: '訪客 Email' }, { key: 'phone', label: '電話' }, { key: 'subject', label: '主旨' }, { key: 'messageHtml', label: '訊息內容（HTML）', html: true }, { key: 'page', label: '來源頁' }, { key: 'adminUrl', label: '後台表單訊息連結' }], subject: '【聯絡表單】{{subject}}', body: '<p><strong>{{name}}</strong>（<a href="mailto:{{email}}">{{email}}</a> {{phone}}）</p><p>來源頁：{{page}}</p><blockquote>{{{messageHtml}}}</blockquote><p><a href="{{adminUrl}}">前往後台查看</a></p>' },
  { kind: 'contact_autoreply', label: '聯絡表單自動回覆（訪客）', desc: '訪客送出表單後立即收到的確認信；可關閉', to: '訪客', optional: true, defaultEnabled: false, vars: [...common, { key: 'name', label: '訪客姓名' }, { key: 'subject', label: '主旨' }, { key: 'messageHtml', label: '訊息內容（HTML）', html: true }], subject: '我們已收到您的訊息｜{{siteName}}', body: '<p>{{name}} 您好，我們已收到您的訊息，會在一個工作天內回覆。</p><blockquote>{{{messageHtml}}}</blockquote><p>{{siteName}}</p>' },
  { kind: 'contact_reply', label: '聯絡表單回覆（訪客）', desc: '站主在後台或指令台回覆訪客時使用', to: '訪客', vars: [...common, { key: 'name', label: '訪客姓名' }, { key: 'subject', label: '原主旨' }, { key: 'messageHtml', label: '原訊息（HTML）', html: true }, { key: 'replyHtml', label: '回覆內容（HTML）', html: true }], subject: 'Re: {{subject}}｜{{siteName}}', body: '<p>{{name}} 您好：</p><p>{{{replyHtml}}}</p><hr><p style="color:#666;font-size:12px">您的原訊息：</p><blockquote style="color:#666">{{{messageHtml}}}</blockquote>' },
];
export const MAIL_KIND_MAP: Record<string, MailKindDef> = Object.fromEntries(MAIL_KINDS.map((k) => [k.kind, k]));

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** 渲染：{{{key}}} 原樣、{{key}} 跳脫；未知變數輸出空字串 */
export function renderMailTemplate(tpl: { subject: string; body: string }, vars: Record<string, string | number | null | undefined>): { subject: string; html: string } {
  const get = (k: string) => {
    const v = vars[k.trim()];
    return v === null || v === undefined ? '' : String(v);
  };
  const body = tpl.body.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k) => get(k)).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => escHtml(get(k)));
  const subject = tpl.subject.replace(/\{\{\{?\s*([\w.]+)\s*\}?\}\}/g, (_, k) => get(k)).replace(/\s+/g, ' ').trim();
  return { subject, html: body };
}

/** 合併覆寫：subject／body 空字串＝用預設；enabled 只對 optional 種類有意義 */
export function resolveMailTemplate(kind: string, overrides: Record<string, Partial<MailTemplate>> | null | undefined): MailTemplate & { def: MailKindDef; customized: boolean } {
  const def = MAIL_KIND_MAP[kind];
  if (!def) throw new Error(`unknown mail kind: ${kind}`);
  const o = overrides?.[kind] ?? {};
  const subject = typeof o.subject === 'string' && o.subject.trim() ? o.subject : def.subject;
  const body = typeof o.body === 'string' && o.body.trim() ? o.body : def.body;
  const enabled = def.optional ? (typeof o.enabled === 'boolean' ? o.enabled : !!def.defaultEnabled) : true;
  return { subject, body, enabled, def, customized: subject !== def.subject || body !== def.body || !!(def.optional && enabled !== !!def.defaultEnabled) };
}

/** 各種類的範例變數（後台預覽用） */
export function sampleMailVars(kind: string, site: { siteName: string; siteUrl: string }): Record<string, string> {
  const base: Record<string, string> = { siteName: site.siteName, siteUrl: site.siteUrl, name: '王小明', email: 'customer@example.com', orderNo: 'SK20260926A1', amount: 'NT$ 1,980', itemsHtml: '<ul><li>示範商品 × 1</li></ul><p>訂單編號 <code>SK20260926A1</code>，金額 <strong>NT$ 1,980</strong></p>', shippingNote: '<p>此訂單需要出貨。</p>', virtualAccount: '9990001234567890', expireAt: '2026-09-30 23:59', status: '已出貨', carrier: '黑貓', trackingNo: '1234567890', courseName: '示範課程', question: '請問第二章的範例檔在哪裡？', from: 'student@example.com', adminUrl: `${site.siteUrl}/admin/messages`, answerHtml: '在章節附件區，已補上連結。', classroomUrl: `${site.siteUrl}/classroom/demo-course`, phone: '0912-345-678', subject: '想詢問合作方案', messageHtml: '您好，想了解企業方案的報價。<br>謝謝。', page: '/p/contact', replyHtml: '您好，企業方案報價已附上，歡迎回信討論。', code: '482913', firstNote: '<strong>此帳號將成為第一位超級管理員。</strong>', loginUrl: `${site.siteUrl}/admin/login`, resetUrl: `${site.siteUrl}/admin/login?mode=forgot` };
  return base;
}

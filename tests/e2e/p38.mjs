// P38：信件範本與聯絡表單回覆——list_mail_templates 11 種；set／preview／reset；自動回覆開關；reply_contact_message 寄信＋標記 replied＋存回覆；
//      後台 POST /api/admin/messages/:id/reply；通知紀錄（storage_status.recent）看得到 kind；MCP 名單；mock 指令台
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const B = process.env.API ?? 'http://localhost:4000';
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const RUN = Date.now().toString(36);
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
ok('admin login', !!admin);
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
const cmd = (message, history = []) => j('/api/admin/ai/command', { method: 'POST', cookie: admin, body: { message, history } });
await act('update_settings', { settings: { 'ai.commandProvider': 'mock', 'mail.adminTo': 'owner@example.com' } });

// 1) 範本清單
const l0 = await act('list_mail_templates');
const tpls = l0.body?.data ?? [];
ok('list_mail_templates 13 種，含 contact_reply／contact_autoreply（optional、預設關）', l0.body?.ok === true && tpls.length === 13 && tpls.some((t) => t.kind === 'contact_reply') && tpls.find((t) => t.kind === 'contact_autoreply')?.optional === true && tpls.find((t) => t.kind === 'contact_autoreply')?.enabled === false, tpls.map((t) => t.kind).join(','));
ok('每種都有 vars／subject／body／defaultSubject', tpls.every((t) => Array.isArray(t.vars) && t.vars.length && t.subject && t.body && t.defaultSubject));

// 2) 預覽／設定／重設
const pv = await act('preview_mail_template', { kind: 'order_paid' });
ok('preview_mail_template 用範例變數渲染（主旨含訂單號、html 含商品清單）', pv.body?.ok === true && /SK20260926A1/.test(pv.body.data.subject) && pv.body.data.html.includes('示範商品'), JSON.stringify(pv.body?.data?.subject));
const setT = await act('set_mail_template', { kind: 'order_paid', subject: `感謝您的訂購 {{orderNo}} ${RUN}`, body: '<p>{{name}} 您好，<b>{{{itemsHtml}}}</b></p>' });
ok('set_mail_template 存入並標 customized', setT.body?.ok === true && setT.body.data.customized === true && setT.body.data.subject.includes(RUN));
const pv2 = await act('preview_mail_template', { kind: 'order_paid' });
ok('預覽反映自訂主旨、{{name}} 跳脫、{{{itemsHtml}}} 原樣', pv2.body?.data?.subject.includes(`感謝您的訂購 SK20260926A1 ${RUN}`) && pv2.body.data.html.includes('王小明 您好') && pv2.body.data.html.includes('<ul><li>示範商品'));
const pvDraft = await act('preview_mail_template', { kind: 'welcome', subject: '試算 {{siteName}}', body: '<i>{{email}}</i> <script>x</script>' });
ok('preview 可試算未儲存內容（不改設定）', pvDraft.body?.data?.subject.startsWith('試算') && pvDraft.body.data.html.includes('<i>customer@example.com</i>'));
const badKind = await act('set_mail_template', { kind: 'nope', subject: 'x' });
ok('未知 kind 被拒', badKind.body?.ok === false);
const reset = await act('set_mail_template', { kind: 'order_paid', reset: true });
ok('reset 回預設', reset.body?.ok === true && reset.body.data.customized === false && reset.body.data.subject === reset.body.data.defaultSubject);

// 3) 聯絡表單：自動回覆關→開；回覆寄信
const before = (await act('storage_status')).body?.data?.recent?.length ?? 0;
const sub1 = await j('/api/content/contact', { method: 'POST', body: { name: '訪客甲', email: `v1+${RUN}@example.com`, subject: `詢問 ${RUN}`, message: '想了解方案\n謝謝' } });
ok('送出表單（自動回覆關閉）', sub1.body?.ok === true && !!sub1.body.id);
await new Promise((r) => setTimeout(r, 400));
const rec1 = (await act('storage_status')).body?.data?.recent ?? [];
ok('通知紀錄：有 contact_message（站主）、contact_autoreply 標 skipped（關閉）', rec1.some((r) => r.kind === 'contact_message' && r.to === 'owner@example.com' && r.result.ok) && rec1.some((r) => r.kind === 'contact_autoreply' && r.result.skipped), JSON.stringify(rec1.slice(0, 3)));
await act('set_mail_template', { kind: 'contact_autoreply', enabled: true, subject: `已收到 {{name}} ${RUN}` });
const sub2 = await j('/api/content/contact', { method: 'POST', body: { name: '訪客乙', email: `v2+${RUN}@example.com`, message: '第二封' } });
await new Promise((r) => setTimeout(r, 400));
const rec2 = (await act('storage_status')).body?.data?.recent ?? [];
ok('自動回覆啟用後：contact_autoreply 寄給訪客 ok', sub2.body?.ok === true && rec2.some((r) => r.kind === 'contact_autoreply' && r.to === `v2+${RUN}@example.com` && r.result.ok), JSON.stringify(rec2.slice(0, 3)));
await act('set_mail_template', { kind: 'contact_autoreply', reset: true });

const rep = await act('reply_contact_message', { id: sub1.body.id, reply: `您好，方案報價如附件。\n${RUN}` });
ok('reply_contact_message：寄信 ok、status=replied、reply 保存、repliedBy', rep.body?.ok === true && rep.body.data.status === 'replied' && rep.body.data.reply.includes(RUN) && rep.body.data.mail?.ok === true && /admin-ai/.test(rep.body.data.repliedBy ?? ''), JSON.stringify(rep.body).slice(0, 200));
const rec3 = (await act('storage_status')).body?.data?.recent ?? [];
ok('通知紀錄有 contact_reply 寄給訪客', rec3.some((r) => r.kind === 'contact_reply' && r.to === `v1+${RUN}@example.com` && r.result.ok));
const empty = await act('reply_contact_message', { id: sub1.body.id, reply: '   ' });
ok('空回覆被拒', empty.body?.ok === false);
const viaApi = await fetch(`${B}/api/admin/messages/${sub2.body.id}/reply`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ reply: '第二封的回覆', subject: `自訂主旨 ${RUN}` }) });
const viaApiJ = await viaApi.json();
ok('後台 POST /api/admin/messages/:id/reply（自訂主旨）', viaApi.status < 300 && viaApiJ.status === 'replied' && viaApiJ.reply === '第二封的回覆');
const list = await j('/api/admin/messages?status=replied', { cookie: admin });
ok('列表 status=replied 含兩筆且帶 reply 欄位', (list.body?.items ?? []).filter((m) => [sub1.body.id, sub2.body.id].includes(m.id) && typeof m.reply === 'string').length === 2);

// 4) mock 指令台
const m1 = await cmd(`回覆訊息 ${sub1.body.id}「再補充一點資訊 ${RUN}」`);
ok('mock：回覆訊息 → reply_contact_message 待確認', (m1.body?.pending ?? []).some((p) => p.action === 'reply_contact_message' && p.params.id === sub1.body.id && p.params.reply.includes(RUN)), JSON.stringify(m1.body?.pending).slice(0, 160));
const m2 = await cmd('列出信件範本');
ok('mock：列出信件範本 → list_mail_templates 即時', (m2.body?.executed ?? []).some((e) => e.action === 'list_mail_templates' && e.ok));

// 收尾
for (const id of [sub1.body.id, sub2.body.id]) await act('delete_contact_message', { id });
await act('update_settings', { settings: { 'mail.adminTo': '' } });
const mcp = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'mcp', 'server.mjs'), 'utf8');
ok('mcp/server.mjs 含四個新工具', ['sitekit_reply_contact_message', 'sitekit_list_mail_templates', 'sitekit_set_mail_template', 'sitekit_preview_mail_template'].every((n) => mcp.includes(`'${n}'`)));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

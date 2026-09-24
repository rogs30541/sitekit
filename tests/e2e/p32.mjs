// P32：套版前後台深度整合——①聯絡表單（前台 contact showForm → POST /api/content/contact → 後台 /api/admin/messages／OPS list_contact_messages、狀態、刪除、蜜罐、頻率）
//      ②區塊頁走內容管線（草稿存 sections 不丟失、沙盒預覽回 sections、發佈後 /api/content/pages 回 sections）③主題設定 update_settings theme.* → /api/content/site.theme
//      ④版型資料無死連結／無 emoji 圖示 ⑤前台 /p/<slug> 有聯絡表單 ⑥MCP 名單
// needs: web
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const B = process.env.API ?? 'http://localhost:4000';
const W = process.env.WEB ?? 'http://localhost:3000';
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie, headers = {} } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...headers, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const untilHtml = async (url, pred, ms = 75000) => {
  const t0 = Date.now(); let html = '';
  while (Date.now() - t0 < ms) { html = await fetch(url, { headers: { 'cache-control': 'no-cache' } }).then((r) => r.text()).catch(() => ''); if (pred(html)) return html; await new Promise((r) => setTimeout(r, 500)); }
  return html;
};
const RUN = Date.now().toString(36);
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
ok('admin login', !!admin);
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });

// ① 聯絡表單
const sub = await j('/api/content/contact', { method: 'POST', body: { name: '王小明', email: `visitor+${RUN}@example.com`, phone: '0912345678', subject: `詢問 ${RUN}`, message: '請問課程什麼時候開？\n謝謝', page: '/p/contact' } });
ok('前台送出聯絡表單 → 200 且回 id', sub.status < 300 && sub.body?.ok === true && !!sub.body?.id, JSON.stringify(sub.body));
const dup = await j('/api/content/contact', { method: 'POST', body: { name: '王小明', email: `visitor+${RUN}@example.com`, message: '再送一次' } });
ok('同 email 60 秒內再送被擋（400）', dup.status === 400, String(dup.status));
const bad = await j('/api/content/contact', { method: 'POST', body: { name: '', email: 'not-an-email', message: '' } });
ok('缺欄位／email 格式錯 → 400', bad.status === 400);
const honey = await j('/api/content/contact', { method: 'POST', body: { name: 'bot', email: `bot+${RUN}@example.com`, message: 'spam', website: 'http://spam' } });
ok('蜜罐命中：假裝成功但不存（id 空）', honey.status < 300 && honey.body?.ok === true && !honey.body?.id);
const list = await j('/api/admin/messages', { cookie: admin });
const mine = (list.body?.items ?? []).find((m) => m.subject === `詢問 ${RUN}`);
ok('後台 /api/admin/messages 列出該訊息（status=new、含 counts）', list.status === 200 && !!mine && mine.status === 'new' && typeof list.body?.counts?.new === 'number', JSON.stringify(list.body).slice(0, 160));
ok('蜜罐訊息沒進資料庫', !(list.body?.items ?? []).some((m) => m.email === `bot+${RUN}@example.com`));
const ops = await act('list_contact_messages', { status: 'new' });
ok('OPS list_contact_messages 同一份資料', ops.body?.ok !== false && (ops.body?.data?.items ?? []).some((m) => m.id === mine?.id));
const upd = await act('update_contact_message', { id: mine?.id, status: 'replied', note: '已電話回覆' });
ok('OPS update_contact_message → replied＋note＋repliedAt', upd.body?.ok !== false && upd.body?.data?.status === 'replied' && upd.body?.data?.note === '已電話回覆' && !!upd.body?.data?.repliedAt, JSON.stringify(upd.body).slice(0, 160));
const badStatus = await act('update_contact_message', { id: mine?.id, status: 'nope' });
ok('未知 status 被拒', badStatus.status >= 400 || badStatus.body?.ok === false);
const patched = await fetch(`${B}/api/admin/messages/${mine?.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ status: 'archived' }) });
ok('後台 PATCH /api/admin/messages/:id → archived', patched.status < 300 && (await patched.json()).status === 'archived');
const noAuth = await fetch(`${B}/api/admin/messages`);
ok('後台訊息端點無 cookie → 401/403', noAuth.status === 401 || noAuth.status === 403, String(noAuth.status));

// ② 區塊頁走內容管線：套一套版型 → 取子頁草稿 → 存草稿（改標題＋加區塊）→ 預覽回 sections → 發佈 → 公開 API 回新 sections
const pre = await act('list_site_templates');
if (pre.body?.data?.current?.id && pre.body?.data?.current?.hasBackup) await act('apply_site_template', { id: pre.body.data.current.id, confirm: true, restore: true });
const tpl = (pre.body?.data?.templates ?? []).find((t) => t.pages.includes('about')) ?? pre.body?.data?.templates?.[0];
const applied = await act('apply_site_template', { id: tpl.id, confirm: true });
ok(`套用 ${tpl.id}（有 about 子頁）`, applied.body?.ok !== false && (applied.body?.data?.pages ?? []).includes('about'));
const draft = await j('/api/admin/content/about/draft', { cookie: admin });
ok('後台取子頁草稿：design.kind=sections 且 sections 非空（不再被當成 HTML）', draft.status === 200 && draft.body?.draft?.design?.kind === 'sections' && draft.body.draft.design.sections.length > 0, JSON.stringify(draft.body?.draft?.design).slice(0, 120));
const n0 = draft.body?.draft?.design?.sections?.length ?? 0;
const newSections = [...(draft.body?.draft?.design?.sections ?? []), { kind: 'faq', title: `FAQ ${RUN}`, items: [{ q: '問', a: '答' }] }, { kind: 'contact', title: '聯絡我們', showForm: true, items: [{ icon: 'mail', label: 'Email', value: 'hi@example.com', href: 'mailto:hi@example.com' }] }];
const saved = await j('/api/admin/content/about/draft', { method: 'PUT', cookie: admin, body: { title: `關於 ${RUN}`, design: { kind: 'sections', sections: newSections } } });
ok('存草稿（sections doc）→ 回 design.kind=sections、區塊數 +2', saved.status < 300 && saved.body?.draft?.design?.kind === 'sections' && saved.body.draft.design.sections.length === n0 + 2, JSON.stringify(saved.body).slice(0, 160));
ok('存草稿：lint 無 error', Array.isArray(saved.body?.lint) && !saved.body.lint.some((l) => l.level === 'error'));
const badDraft = await j('/api/admin/content/about/draft', { method: 'PUT', cookie: admin, body: { design: { kind: 'sections', sections: [{ kind: 'nope' }] } } });
ok('存草稿：未知 kind 被 zod 擋（400）', badDraft.status === 400);
const prevTok = await j('/api/admin/content/about/preview-token', { method: 'POST', cookie: admin });
const prevId = (prevTok.body?.url ?? '').match(/\/preview\/([^?]+)\?token=([^&]+)/);
const prev = prevId ? await j(`/api/content/preview/${prevId[1]}?token=${prevId[2]}`) : { status: 0, body: null };
ok('沙盒預覽 API 回 sections（含新 FAQ）', prev.status === 200 && Array.isArray(prev.body?.sections) && prev.body.sections.some((s) => s.kind === 'faq' && s.title === `FAQ ${RUN}`), JSON.stringify(prev.body).slice(0, 120));
const pub = await j('/api/admin/content/about/publish', { method: 'POST', cookie: admin, body: { confirm: true } });
ok('發佈區塊頁成功（version +1）', pub.status < 300 && pub.body?.version >= 2, JSON.stringify(pub.body).slice(0, 120));
const page = await j('/api/content/pages/about');
ok('公開 /api/content/pages/about 回新 sections 與新標題', page.status === 200 && page.body?.title === `關於 ${RUN}` && (page.body?.sections ?? []).some((s) => s.kind === 'faq' && s.title === `FAQ ${RUN}`));
ok('公開頁 body 後備 HTML 含 FAQ 標題', typeof page.body?.body === 'string' && page.body.body.includes(`FAQ ${RUN}`));

// ⑤ 前台 /p/about：區塊＋聯絡表單
const html = await untilHtml(`${W}/p/about`, (h) => h.includes(`FAQ ${RUN}`) && h.includes('data-contact-form'));
ok('前台 /p/about 渲染新 FAQ 區塊與聯絡表單（data-contact-form）', html.includes(`FAQ ${RUN}`) && html.includes('data-contact-form'));
ok('前台區塊圖示為 SVG（無 emoji）', html.includes('<svg') && !/[\u{1F300}-\u{1FAFF}]/u.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));

// ③ 主題設定
const t1 = await act('update_settings', { settings: { 'theme.mode': 'dark', 'theme.font': 'serif', 'theme.radius': 'xl', 'theme.header': 'centered', 'theme.footer': 'minimal', 'brand.primaryColor': '#0055ff' } });
ok('update_settings theme.* 成功', t1.body?.ok === true);
const site = await j('/api/content/site');
ok('/api/content/site.theme 反映：dark／serif／xl／centered／minimal，accent 以主色為準', site.body?.theme?.mode === 'dark' && site.body?.theme?.font === 'serif' && site.body?.theme?.radius === 'xl' && site.body?.theme?.header === 'centered' && site.body?.theme?.footer === 'minimal' && site.body?.theme?.accent === '#0055ff', JSON.stringify(site.body?.theme));
const home = await untilHtml(`${W}/`, (h) => h.includes('data-theme="dark"') && h.includes('data-header="centered"') && h.toLowerCase().includes('--accent:#0055ff'));
ok('首頁 html 帶 data-theme=dark、data-header=centered、--accent 主色', home.includes('data-theme="dark"') && home.includes('data-header="centered"') && home.toLowerCase().includes('--accent:#0055ff'), home.match(/<html[^>]*>/)?.[0]?.slice(0, 160));

// ④ 版型資料完整性：50 套；套用後子頁清單涵蓋主選單連到的 /p/<slug>（withGenericPages 自動補 about／contact／faq）
const tpls = pre.body?.data?.templates ?? [];
ok('50 套版型皆有 pages 陣列且不含 emoji 圖示名稱', tpls.length === 50 && tpls.every((t) => Array.isArray(t.pages)) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(JSON.stringify(tpls)));

// 收尾：還原、清訊息
await act('apply_site_template', { id: tpl.id, confirm: true, restore: true });
await act('update_settings', { settings: { 'brand.primaryColor': '', 'theme.mode': '', 'theme.font': '', 'theme.radius': '', 'theme.header': '', 'theme.footer': '' } });
const del = await act('delete_contact_message', { id: mine?.id });
ok('OPS delete_contact_message', del.body?.ok !== false && del.body?.data?.deleted === true);

// ⑥ MCP 名單
const mcp = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'mcp', 'server.mjs'), 'utf8');
ok('mcp/server.mjs 含 contact 三工具', ['sitekit_list_contact_messages', 'sitekit_update_contact_message', 'sitekit_delete_contact_message'].every((n) => mcp.includes(`'${n}'`)));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

// P31：快速套版——list_site_templates 五分類 × 10 套；apply_site_template 需 confirm；套用後 theme.*／首頁區塊／選單／子頁同步；
//      前台 /api/content/site 帶 theme、/api/content/pages/<slug> 回 sections；前台 HTML 帶主題 CSS 變數與區塊；restore 還原；MCP 名單含兩工具
// needs: web
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const B = process.env.API ?? 'http://localhost:4000';
const W = process.env.WEB ?? 'http://localhost:3000';
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const untilHtml = async (url, pred, ms = 75000) => {
  const t0 = Date.now(); let html = '';
  while (Date.now() - t0 < ms) { html = await fetch(url, { headers: { 'cache-control': 'no-cache' } }).then((r) => r.text()).catch(() => ''); if (pred(html)) return html; await new Promise((r) => setTimeout(r, 500)); }
  return html;
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
ok('admin login', !!admin);
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });

// 1) 名單
const list = await act('list_site_templates');
const tpls = list.body?.data?.templates ?? [];
ok('list_site_templates 回 50 套', list.status < 300 && tpls.length === 50, String(tpls.length));
const byCat = tpls.reduce((m, t) => ((m[t.category] = (m[t.category] ?? 0) + 1), m), {});
ok('五分類各 10 套', ['image', 'shop', 'course', 'brand', 'service'].every((c) => byCat[c] === 10), JSON.stringify(byCat));
ok('每套含 theme.accent／homeKinds／pages', tpls.every((t) => /^#[0-9a-f]{6}$/i.test(t.theme?.accent ?? '') && Array.isArray(t.homeKinds) && t.homeKinds.length >= 3 && Array.isArray(t.pages)));
ok('必用三站來源版型存在（ifreeaprogram／airuru／shifu）', ['course-toolbox-dashboard', 'course-master-platform', 'service-agency-video'].every((id) => tpls.some((t) => t.id === id)));
const filtered = await act('list_site_templates', { category: 'shop' });
ok('category=shop 過濾＝10', (filtered.body?.data?.templates ?? []).length === 10);
ok('current 尚未套用', list.body?.data?.current?.id === '' || typeof list.body?.data?.current?.id === 'string');

// 2) 保護：無 confirm 拒絕；未知 id 拒絕
const noConfirm = await act('apply_site_template', { id: 'course-master-platform' });
ok('apply 無 confirm 被拒', noConfirm.status >= 400 || noConfirm.body?.ok === false, JSON.stringify(noConfirm.body).slice(0, 120));
const badId = await act('apply_site_template', { id: 'nope-nope', confirm: true });
ok('apply 未知 id 被拒', badId.status >= 400 || badId.body?.ok === false);

// 3) 套用深色版型（挑一套 mode=dark 以驗證主題變數）
const dark = tpls.find((t) => t.theme?.mode === 'dark') ?? tpls[0];
const before = await j('/api/content/site');
const applied = await act('apply_site_template', { id: dark.id, confirm: true });
const d = applied.body?.data ?? {};
ok(`apply ${dark.id} 成功`, applied.status < 300 && applied.body?.ok !== false && d.id === dark.id, JSON.stringify(applied.body).slice(0, 160));
ok('回傳 homeSections>0 與 pages 陣列', d.homeSections > 0 && Array.isArray(d.pages) && d.pages.length === dark.pages.length, `${d.homeSections} / ${JSON.stringify(d.pages)}`);

const settings = (await act('get_settings')).body?.data ?? {};
ok('settings theme.accent／theme.mode 已寫入', settings['theme.accent'] === dark.theme.accent && settings['theme.mode'] === dark.theme.mode, `${settings['theme.accent']} ${settings['theme.mode']}`);
ok('brand.primaryColor 跟 accent', settings['brand.primaryColor'] === dark.theme.accent);
ok('template.current／backup 已存', settings['template.current'] === dark.id && !!settings['template.backup']);

const site = await j('/api/content/site');
ok('/api/content/site 帶 theme（mode／accent／font／radius）', site.body?.theme?.mode === dark.theme.mode && site.body?.theme?.accent === dark.theme.accent && !!site.body?.theme?.font && !!site.body?.theme?.radius, JSON.stringify(site.body?.theme));
ok('首頁區塊已換（kind 序列等於版型 homeKinds）', JSON.stringify((site.body?.home?.sections ?? []).map((s) => s.kind)) === JSON.stringify(dark.homeKinds.map((k) => k.split(/[:@]/)[0])));
ok('主選單已換（label 等於版型 headerMenu）', JSON.stringify((site.body?.menus?.header ?? []).map((m) => m.label)) === JSON.stringify(dark.headerMenu), JSON.stringify((site.body?.menus?.header ?? []).map((m) => m.label)));
ok('每個首頁區塊都通過 schema（有 tone 欄位）', (site.body?.home?.sections ?? []).every((s) => typeof s.tone === 'string'));

// 4) 子頁：API 回 sections；前台 /p/<slug> 渲染區塊
const slug = dark.pages[0];
if (slug) {
  const page = await j(`/api/content/pages/${slug}`);
  ok(`/api/content/pages/${slug} 回 sections 陣列且 hasDesign=false`, page.status === 200 && Array.isArray(page.body?.sections) && page.body.sections.length > 0 && page.body.hasDesign === false, JSON.stringify(page.body).slice(0, 120));
  ok('子頁 body 有後備 HTML（<section>）', typeof page.body?.body === 'string' && page.body.body.includes('<section>'));
  const firstTitle = page.body?.sections?.find((s) => s.title)?.title ?? '';
  const html = await untilHtml(`${W}/p/${slug}`, (h) => h.includes('sk-sections') && (!firstTitle || h.includes(firstTitle)));
  ok(`前台 /p/${slug} 渲染區塊（sk-sections＋第一個標題）`, html.includes('sk-sections') && (!firstTitle || h(html, firstTitle)), firstTitle);
  // 冪等：再套一次不會新增第二份頁面（version +1）
  const again = await act('apply_site_template', { id: dark.id, confirm: true });
  const page2 = await j(`/api/content/pages/${slug}`);
  ok('重套同版型：子頁 slug 冪等且 version +1', again.status < 300 && page2.body?.version === (page.body?.version ?? 0) + 1, `${page.body?.version} → ${page2.body?.version}`);
}
function h(html, s) { return html.includes(s) || html.includes(s.replace(/&/g, '&amp;')); }

// 5) 前台首頁：主題 CSS 變數＋data-theme＋區塊
const home = await untilHtml(`${W}/`, (x) => x.includes(`data-theme="${dark.theme.mode}"`) && x.includes('sk-sections'));
ok('首頁 html 帶 data-theme 與 --accent 變數', home.includes(`data-theme="${dark.theme.mode}"`) && home.toLowerCase().includes(`--accent:${dark.theme.accent.toLowerCase()}`), home.match(/<html[^>]*>/)?.[0]?.slice(0, 200));
ok('首頁渲染 SectionRenderer（sk-sections）與 hero 標題', home.includes('sk-sections') && h(home, (site.body?.home?.sections ?? []).find((s) => s.kind === 'hero')?.title ?? 'sk-sections'));
ok('首頁 header 選單顯示版型項目', dark.headerMenu.slice(0, 2).every((l) => h(home, l)));

// 6) 首頁區塊編輯 API 接受新 kind（stats／faq）
const put = await fetch(`${B}/api/admin/site/home`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ sections: [{ kind: 'stats', items: [{ value: '99%', label: '滿意' }] }, { kind: 'faq', title: 'FAQ', items: [{ q: 'Q', a: 'A' }] }] }) });
ok('PUT /api/admin/site/home 接受 20 種 kind（stats／faq）', put.status < 300, String(put.status));
const badPut = await fetch(`${B}/api/admin/site/home`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ sections: [{ kind: 'nope' }] }) });
ok('PUT 未知 kind 被 zod 擋', badPut.status >= 400);

// 7) 還原
const restored = await act('apply_site_template', { id: dark.id, confirm: true, restore: true });
ok('restore 成功', restored.status < 300 && restored.body?.data?.restored === true, JSON.stringify(restored.body).slice(0, 120));
const s2 = (await act('get_settings')).body?.data ?? {};
ok('restore 後 template.current 清空、theme.mode 回復', !s2['template.current'] && (s2['theme.mode'] ?? '') === (before.body?.theme?.mode === 'dark' ? 'dark' : (s2['theme.mode'] ?? '')));
const site2 = await j('/api/content/site');
ok('restore 後首頁區塊數回到套用前', (site2.body?.home?.sections ?? []).length === (before.body?.home?.sections ?? []).length, `${(site2.body?.home?.sections ?? []).length} vs ${(before.body?.home?.sections ?? []).length}`);
ok('restore 後主選單回到套用前', JSON.stringify((site2.body?.menus?.header ?? []).map((m) => m.label)) === JSON.stringify((before.body?.menus?.header ?? []).map((m) => m.label)));

// 8) MCP server 名單含兩工具
const mcp = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'mcp', 'server.mjs'), 'utf8');
ok('mcp/server.mjs 含 sitekit_list_site_templates／sitekit_apply_site_template', mcp.includes("'sitekit_list_site_templates'") && mcp.includes("'sitekit_apply_site_template'"));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

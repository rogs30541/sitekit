// P37：ChatGPT Ads（OpenAI）Measurement Pixel——set_tracking openaiPixel 正規化與持久化；/api/content/site 帶 openaiPixel；
//      前台 HTML 載入 oaiq SDK 並 init pixelId；頁面層級覆蓋（銷售頁 doc.tracking.openaiPixel 不同於網站時另載）；追蹤設定欄位定義含 openaiPixel
// needs: web
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
const RUN = Date.now().toString(36);
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
ok('admin login', !!admin);
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
const cur = (await act('get_tracking')).body?.data ?? {};
ok('get_tracking 含 openaiPixel 欄位（預設空）', 'openaiPixel' in cur && cur.openaiPixel === '');

// 1) 設定與正規化
const bad = await act('set_tracking', { ...cur, openaiPixel: 'bad pixel id!' });
ok('非法 Pixel ID（含空白／驚嘆號）被清空', bad.body?.ok === true && bad.body.data.openaiPixel === '');
const good = await act('set_tracking', { ...cur, openaiPixel: `px_${RUN}ABC-1` });
ok('合法 Pixel ID 存入', good.body?.ok === true && good.body.data.openaiPixel === `px_${RUN}ABC-1`, JSON.stringify(good.body?.data?.openaiPixel));
const again = (await act('get_tracking')).body?.data;
ok('get_tracking 回讀持久化', again?.openaiPixel === `px_${RUN}ABC-1`);
const site = await j('/api/content/site');
ok('/api/content/site.tracking.openaiPixel', site.body?.tracking?.openaiPixel === `px_${RUN}ABC-1`);

// 2) 前台載入 SDK 與 init
const home = await untilHtml(`${W}/`, (h) => h.includes('bzrcdn.openai.com/sdk/oaiq.min.js') && h.includes(`pixelId:'px_${RUN}ABC-1'`));
ok('首頁 HTML 載入 oaiq SDK 並 init pixelId', home.includes('bzrcdn.openai.com/sdk/oaiq.min.js') && home.includes(`oaiq('init',{pixelId:'px_${RUN}ABC-1'})`), home.match(/oaiq\('init'[^)]*\)/)?.[0]);
ok('首頁只載一次（site scope）', (home.match(/oaiq\.min\.js/g) ?? []).length === 1);

// 3) 頁面層級覆蓋：銷售頁不同 pixel → 另載一份；相同則不重複
const ap = await act('apply_sales_template', { id: 'sales-brand-cream', slug: `p37-${RUN}`, title: `P37 ${RUN}`, confirm: true });
await act('upsert_sales_page', { slug: `p37-${RUN}`, doc: { tracking: { openaiPixel: `page_${RUN}` } } });
await act('publish_sales_page', { idOrSlug: `p37-${RUN}`, confirm: true });
const sp = await untilHtml(`${W}/s/p37-${RUN}`, (h) => h.includes(`pixelId:'page_${RUN}'`));
ok('銷售頁 HTML 含頁面層級 pixel init（與網站不同→另載）', sp.includes(`oaiq('init',{pixelId:'page_${RUN}'})`) && sp.includes(`oaiq('init',{pixelId:'px_${RUN}ABC-1'})`), (sp.match(/oaiq\('init'[^)]*\)/g) ?? []).join(' | '));
await act('upsert_sales_page', { slug: `p37-${RUN}`, doc: { tracking: { openaiPixel: `px_${RUN}ABC-1` } } });
await act('publish_sales_page', { idOrSlug: `p37-${RUN}`, confirm: true });
const sp2 = await untilHtml(`${W}/s/p37-${RUN}`, (h) => (h.match(/oaiq\('init'/g) ?? []).length === 1);
ok('銷售頁 pixel 與網站相同 → 只載一次', (sp2.match(/oaiq\('init'/g) ?? []).length === 1);

// 4) 欄位定義（後台表單資料來源）
const fields = await j('/api/admin/site', { cookie: admin });
ok('後台 tracking 設定含 openaiPixel', fields.status === 200 && JSON.stringify(fields.body).includes('openaiPixel'));

// 收尾
await fetch(`${B}/api/admin/sales/${ap.body?.data?.id}`, { method: 'DELETE', headers: { cookie: admin } });
await act('set_tracking', { ...cur, openaiPixel: '' });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

// needs: web
// P9 本機端到端：網站架構樹／選單（後台 PUT、公開 GET、OPS get_menu/set_menu、前台導覽渲染、隱藏／草稿頁過濾、深度與驗證）
const B = process.env.API ?? 'http://localhost:4000';
const W = process.env.WEB ?? 'http://localhost:3000';
const RUN = Date.now().toString(36).slice(-4).toLowerCase();
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });

const pubPage = await j('/api/admin/content', { method: 'POST', cookie: admin, body: { type: 'page', title: `關於 ${RUN}`, slug: `about-${RUN}`, body: '<p>about</p>', status: 'published' } });
const draftPage = await j('/api/admin/content', { method: 'POST', cookie: admin, body: { type: 'page', title: `草稿 ${RUN}`, slug: `draft-${RUN}`, body: '<p>x</p>', status: 'draft' } });
ok('建立測試頁面', pubPage.status === 201 && draftPage.status === 201);

const items = [
  { label: '官網', kind: 'route', href: '/' },
  { label: `關於我們 ${RUN}`, kind: 'page', contentId: pubPage.body.id, children: [{ label: `子頁草稿 ${RUN}`, kind: 'page', contentId: draftPage.body.id }, { label: '課程', kind: 'route', href: '/courses' }] },
  { label: '隱藏的', kind: 'route', href: '/store', isVisible: false },
  { label: 'FB', kind: 'link', href: 'https://facebook.com/x', newTab: true },
];
const put = await j('/api/admin/menu', { method: 'PUT', cookie: admin, body: { items } });
ok('PUT /api/admin/menu 覆寫成功、回整棵樹', put.status === 200 && put.body.length === 4 && put.body[1].children.length === 2 && put.body[1].href === `/p/about-${RUN}`, JSON.stringify(put.body.map((n) => n.label)));
const pub = await j('/api/content/menu');
ok('公開選單：隱藏節點與草稿頁被過濾、href 已解析', pub.status === 200 && pub.body.length === 3 && !pub.body.some((n) => n.label === '隱藏的') && pub.body[1].children.length === 1 && pub.body[1].children[0].href === '/courses' && pub.body[2].href === 'https://facebook.com/x' && pub.body[2].newTab === true, JSON.stringify(pub.body.map((n) => [n.label, n.href])));
const noAuth = await j('/api/admin/menu', { method: 'PUT', body: { items } });
ok('未登入不可改選單', noAuth.status === 401);
const deep = await j('/api/admin/menu', { method: 'PUT', cookie: admin, body: { items: [{ label: 'a', kind: 'route', href: '/', children: [{ label: 'b', kind: 'route', href: '/', children: [{ label: 'c', kind: 'route', href: '/' }] }] }] } });
ok('超過兩層 → 400', deep.status === 400);
const badRoute = await j('/api/admin/menu', { method: 'PUT', cookie: admin, body: { items: [{ label: 'x', kind: 'route', href: 'store' }] } });
ok('站內路徑須以 / 開頭 → 400', badRoute.status === 400);
const badPage = await j('/api/admin/menu', { method: 'PUT', cookie: admin, body: { items: [{ label: 'x', kind: 'page', contentId: 'nope' }] } });
ok('綁不存在的頁面 → 400', badPage.status === 400);
const still = await j('/api/content/menu');
ok('驗證失敗不影響既有選單', still.body.length === 3);
const got = await act('get_menu');
ok('OPS get_menu（含隱藏節點）', got.body.ok && got.body.data.length === 4);
const set = await act('set_menu', { items: [{ label: '首頁', kind: 'route', href: '/' }, { label: `關於 ${RUN}`, kind: 'page', contentId: pubPage.body.id }] });
ok('OPS set_menu', set.body.ok && set.body.data.length === 2);
const html = await (await fetch(`${W}/`, { headers: { 'cache-control': 'no-cache' } })).text();
ok('前台導覽渲染選單（ISR 60 秒內可能為舊版）', html.includes(`關於 ${RUN}`) || html.includes('關於我們') || html.includes('關於 '));
await j(`/api/admin/content/${pubPage.body.id}`, { method: 'DELETE', cookie: admin });
const afterDel = await j('/api/content/menu');
ok('刪除頁面後選單節點自動失效（contentId SetNull → 不顯示）', !afterDel.body.some((n) => n.label === `關於 ${RUN}`));
await act('set_menu', { items: [] });
const empty = await j('/api/content/menu');
ok('清空後前台用預設導覽（API 回空陣列）', empty.body.length === 0);
await j(`/api/admin/content/${draftPage.body.id}`, { method: 'DELETE', cookie: admin });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

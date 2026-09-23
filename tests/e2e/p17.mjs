// needs: web
// P17 本機端到端：追蹤碼——網站層級設定（PUT／OPS get/set、ID 格式驗證、公開 site 回傳）、頁面層級（design.settings.tracking 經發佈後 pages API 回傳）、銷售頁 doc.tracking 正規化、前台注入（GTM／GA4／Pixel／自訂碼）
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
const until = async (url, test, ms = 80000) => {
  const t0 = Date.now();
  let last = { status: 0, text: '' };
  while (Date.now() - t0 < ms) {
    last = await fetch(url, { cache: 'no-store' }).then(async (r) => ({ status: r.status, text: await r.text() })).catch(() => ({ status: 0, text: '' }));
    if (last.status === 200 && test(last.text)) return last;
    await new Promise((r) => setTimeout(r, 4000));
  }
  return last;
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
ok('admin login', !!admin);

// 1. 網站層級
const before = await act('get_tracking', {});
const set = await j('/api/admin/site/tracking', { method: 'PUT', cookie: admin, body: { ga4: 'G-ABCD1234', gtm: 'GTM-TEST123', fbPixel: '123456789012', tiktok: 'CABCDEFGHIJ', lineTag: 'abcdefgh-1234', googleAdsId: 'AW-123456789', googleAdsLabel: 'abcDEF_123', head: '<script>window.__skHead=1</script>', bodyTop: '<div id="sk-top-marker"></div>', bodyBottom: '<script>window.__skBottom=1</script>', events: { addToCart: 'window.__skAdd=(window.__skAdd||0)+1', purchase: 'window.__skPurchase=order.no' }, bogus: 'x' } });
ok('PUT 網站追蹤設定：正規化並回傳', set.status === 200 && set.body.ga4 === 'G-ABCD1234' && set.body.gtm === 'GTM-TEST123' && set.body.events.addToCart.includes('__skAdd') && !('bogus' in set.body), JSON.stringify(set.body).slice(0, 200));
const bad = await j('/api/admin/site/tracking', { method: 'PUT', cookie: admin, body: { ...set.body, ga4: 'not-an-id', fbPixel: 'abc' } });
ok('ID 格式不符被清空', bad.status === 200 && bad.body.ga4 === '' && bad.body.fbPixel === '');
await j('/api/admin/site/tracking', { method: 'PUT', cookie: admin, body: set.body });
const site = await j('/api/content/site');
ok('公開 /api/content/site 含 tracking', site.status === 200 && site.body.tracking?.gtm === 'GTM-TEST123' && site.body.tracking.events.purchase.includes('__skPurchase'));
const got = await act('get_tracking', {});
ok('OPS get_tracking', got.body.ok && got.body.data.ga4 === 'G-ABCD1234');
const setOps = await act('set_tracking', { ...got.body.data, tiktok: 'CZZZZZZZZZ' });
ok('OPS set_tracking', setOps.body.ok && setOps.body.data.tiktok === 'CZZZZZZZZZ');
const adminSite = await j('/api/admin/site', { cookie: admin });
ok('後台網站設定回 tracking', adminSite.body.tracking?.tiktok === 'CZZZZZZZZZ');

// 2. 前台注入（首頁走網站層級）
const home = await until(`${W}/`, (t) => t.includes('ns.html?id=GTM-TEST123'));
ok('首頁 HTML 含 GTM／GA4／Pixel／TikTok／LINE 載入碼（ISR 最多 60 秒）', home.status === 200 && home.text.includes("gtm.js?id='+i") && home.text.includes('gtag/js?id=G-ABCD1234') && home.text.includes("fbq('init','123456789012')") && home.text.includes("ttq.load('CZZZZZZZZZ')") && home.text.includes("tagId:'abcdefgh-1234'"), String(home.status));
ok('首頁含 GTM noscript 與 Google Ads 設定', home.text.includes('ns.html?id=GTM-TEST123') && home.text.includes("gtag('config','AW-123456789')"));

// 3. 頁面層級：design.settings.tracking → 發佈 → pages API 回 tracking → 前台 /p 注入頁面專用 Pixel
const c = await j('/api/admin/content', { method: 'POST', cookie: admin, body: { type: 'page', title: `追蹤頁 ${RUN}`, slug: `track-${RUN}`, status: 'draft' } });
const design = { root: { type: 'root', children: [{ type: 'section', props: {}, children: [{ type: 'heading', props: { level: 1, text: `追蹤頁 ${RUN}` } }] }] }, settings: { tracking: { fbPixel: '999888777666', head: '<script>window.__skPageHead=1</script>', events: { pageView: 'window.__skPv=1' }, ga4: 'bad' } } };
const d = await j(`/api/admin/content/${c.body.id}/draft`, { method: 'PUT', cookie: admin, body: { design } });
ok('草稿保存 settings.tracking（格式不符的 ga4 清空、fbPixel 保留）', d.status === 200 && d.body.draft.design.settings.tracking.fbPixel === '999888777666' && d.body.draft.design.settings.tracking.ga4 === '' && d.body.draft.design.settings.tracking.events.pageView === 'window.__skPv=1', JSON.stringify(d.body.draft.design.settings));
const pub = await j(`/api/admin/content/${c.body.id}/publish`, { method: 'POST', cookie: admin, body: { confirm: true } });
ok('發佈', pub.status === 201);
const page = await j(`/api/content/pages/track-${RUN}`);
ok('pages API 回 tracking、body 不含追蹤 script', page.status === 200 && page.body.tracking?.fbPixel === '999888777666' && !page.body.body.includes('__skPageHead'));
const web = await until(`${W}/p/track-${RUN}`, (t) => t.includes("fbq('init','999888777666')"));
ok('前台 /p 頁載入頁面專用 Pixel（與網站 Pixel 不同）與網站 GTM', web.status === 200 && web.text.includes("fbq('init','999888777666')") && web.text.includes('ns.html?id=GTM-TEST123') && web.text.includes('__skPageHead'), String(web.status));
const exp = await j(`/api/admin/content/${c.body.id}/export`, { cookie: admin });
ok('匯出設計含 settings.tracking', exp.body.design.settings.tracking.fbPixel === '999888777666');

// 4. 銷售頁 doc.tracking 正規化＋前台
const products = (await j('/api/admin/catalog/products', { cookie: admin })).body;
const sp = await j('/api/admin/sales', { method: 'POST', cookie: admin, body: { title: `追蹤銷售頁 ${RUN}`, slug: `track-sale-${RUN}` } });
const sd = await j(`/api/admin/sales/${sp.body.page.id}/draft`, { method: 'PUT', cookie: admin, body: { doc: { items: [{ productId: products[0].id, kind: 'product', order: 0 }], tracking: { tiktok: 'CPAGEPIXEL1', googleAdsId: 'AW-5555555', googleAdsLabel: 'lbl_1', events: { initiateCheckout: 'window.__skIc=1' }, gtm: 'nope' } } } });
ok('銷售頁草稿 tracking 正規化（gtm 清空、initiateCheckout 保留）', sd.status === 200 && sd.body.doc.tracking.tiktok === 'CPAGEPIXEL1' && sd.body.doc.tracking.gtm === '' && sd.body.doc.tracking.events.initiateCheckout === 'window.__skIc=1' && sd.body.doc.tracking.googleAdsLabel === 'lbl_1');
await j(`/api/admin/sales/${sp.body.page.id}/publish`, { method: 'POST', cookie: admin, body: { confirm: true } });
const sweb = await until(`${W}/s/track-sale-${RUN}`, (t) => t.includes("ttq.load('CPAGEPIXEL1')"));
ok('前台銷售頁載入頁面 TikTok Pixel 與網站 GTM', sweb.status === 200 && sweb.text.includes("ttq.load('CPAGEPIXEL1')") && sweb.text.includes('ns.html?id=GTM-TEST123'), String(sweb.status));
const tok = await j(`/api/admin/sales/${sp.body.page.id}/preview-token`, { method: 'POST', cookie: admin });
const pweb = await fetch(`${W}/preview/sales/${sp.body.page.id}?token=${encodeURIComponent(tok.body.token)}`).then(async (r) => ({ status: r.status, text: await r.text() }));
ok('沙盒預覽不載入頁面追蹤碼', pweb.status === 200 && !pweb.text.includes("ttq.load('CPAGEPIXEL1')"));

// 清理＋還原
await j(`/api/admin/content/${c.body.id}`, { method: 'DELETE', cookie: admin });
await j(`/api/admin/sales/${sp.body.page.id}`, { method: 'DELETE', cookie: admin });
await j('/api/admin/site/tracking', { method: 'PUT', cookie: admin, body: before.body.data ?? {} });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

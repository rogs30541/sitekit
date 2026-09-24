// needs: web
// P10 本機端到端：站台設定（品牌／聯絡／SEO）、首頁區塊、頁尾選單、公開 /api/content/site、sitemap、前台渲染（導覽名稱／頁尾／GA／區塊）
const B = process.env.API ?? 'http://localhost:4000';
const W = process.env.WEB ?? 'http://localhost:3000';
// 發佈即清快取是非同步（api 去抖 300ms 後通知 web），前台以輪詢等待新內容（最多 10 秒）
const untilHtml = async (url, pred, ms = 10000) => {
  const t0 = Date.now();
  let html = '';
  while (Date.now() - t0 < ms) {
    html = await fetch(url, { headers: { 'cache-control': 'no-cache' } }).then((r) => r.text()).catch(() => '');
    if (pred(html)) return html;
    await new Promise((r) => setTimeout(r, 500));
  }
  return html;
};

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

const set = await act('update_settings', { settings: { 'brand.siteName': `測試站 ${RUN}`, 'brand.tagline': '一句標語', 'brand.primaryColor': '#0b6e77', 'brand.contactEmail': `hi-${RUN}@example.com`, 'brand.facebook': 'https://facebook.com/x', 'brand.footerText': `頁尾文字 ${RUN}`, 'seo.gaId': 'G-TEST1234', 'seo.ogImage': 'https://example.com/og.png' } });
ok('update_settings 品牌／SEO', set.body.ok);
const site = await j('/api/content/site');
ok('公開 /api/content/site 回品牌與 SEO', site.status === 200 && site.body.brand.siteName === `測試站 ${RUN}` && site.body.brand.primaryColor === '#0b6e77' && site.body.brand.seo.gaId === 'G-TEST1234' && site.body.brand.social.facebook === 'https://facebook.com/x');
const badColor = await act('update_settings', { settings: { 'brand.primaryColor': 'red;evil' } });
ok('非法主色被忽略（回空）', badColor.body.ok && (await j('/api/content/site')).body.brand.primaryColor === '');
await act('update_settings', { settings: { 'brand.primaryColor': '#0b6e77' } });

const secs = [
  { kind: 'hero', title: `歡迎 ${RUN}`, subtitle: '副標', ctaText: '看課程', ctaHref: '/courses' },
  { kind: 'features', title: '特色', items: [{ title: '快', text: 'x', icon: '⚡' }, { title: '好', text: 'y' }] },
  { kind: 'courses', title: '精選課程', limit: 2 },
  { kind: 'posts', title: '最新文章', limit: 2 },
  { kind: 'html', html: '<p>自訂</p><script>alert(1)</script>' },
  { kind: 'cta', title: 'CTA', buttonText: '加入', buttonHref: '/register' },
];
const put = await j('/api/admin/site/home', { method: 'PUT', cookie: admin, body: { sections: secs } });
ok('PUT /api/admin/site/home 存首頁區塊', put.status === 200 && put.body.length === 6, JSON.stringify(put.body.map((s) => s.kind)));
const badSec = await j('/api/admin/site/home', { method: 'PUT', cookie: admin, body: { sections: [{ kind: 'hero', title: 'x', ctaHref: 'javascript:alert(1)' }] } });
ok('非法連結 → 400', badSec.status === 400);
const badKind = await j('/api/admin/site/home', { method: 'PUT', cookie: admin, body: { sections: [{ kind: 'video' }] } });
ok('未知區塊 → 400', badKind.status === 400);
const opsSite = await act('get_site');
ok('OPS get_site 含 sections 與 settings', opsSite.body.ok && opsSite.body.data.home.sections.length === 6 && opsSite.body.data.settings['brand.siteName'] === `測試站 ${RUN}`);
const opsSet = await act('set_home_sections', { sections: [{ kind: 'hero', title: `OPS ${RUN}` }] });
ok('OPS set_home_sections', opsSet.body.ok && opsSet.body.data.length === 1);
await j('/api/admin/site/home', { method: 'PUT', cookie: admin, body: { sections: secs } });

const footer = await j('/api/admin/menu?location=footer', { method: 'PUT', cookie: admin, body: { items: [{ label: `隱私 ${RUN}`, kind: 'route', href: '/p/privacy' }, { label: '官網', kind: 'route', href: '/' }] } });
ok('頁尾選單 PUT', footer.status === 200 && footer.body.length === 2);
const header = await j('/api/content/menu');
ok('主選單不受頁尾影響', header.status === 200 && !header.body.some((n) => n.label === `隱私 ${RUN}`));
const pubFooter = await j('/api/content/menu?location=footer');
ok('公開頁尾選單', pubFooter.body.length === 2);
const opsFooter = await act('get_menu', { location: 'footer' });
ok('OPS get_menu location=footer', opsFooter.body.ok && opsFooter.body.data.length === 2);

const pages = await j('/api/content/pages');
ok('公開 /api/content/pages', pages.status === 200 && Array.isArray(pages.body));
const sm = await untilHtml(`${W}/sitemap.xml`, (t) => t.includes('/course/') && t.includes('/blog/'));
ok('sitemap 含 /course/ 與 /blog/', sm.includes('/course/') && sm.includes('/blog/'));
const html = await untilHtml(`${W}/`, (h) => h.includes(`歡迎 ${RUN}`) && h.includes(`測試站 ${RUN}`) && h.includes('G-TEST1234'));
ok('首頁渲染區塊（hero／features／cta）', html.includes(`歡迎 ${RUN}`) && html.includes('特色') && html.includes('CTA'), `len=${html.length} hero=${html.includes(`歡迎 ${RUN}`)} site=${html.includes(`測試站 ${RUN}`)} ga=${html.includes('G-TEST1234')} apiHome=${JSON.stringify((await j('/api/content/site')).body.home).slice(0, 300)} body=${html.replace(/\s+/g, ' ').slice(-400)}`);
ok('首頁 script 被清、HTML 區塊保留', html.includes('自訂') && !html.includes('alert(1)'), `custom=${html.includes('自訂')} script=${html.includes('alert(1)')}`);
ok('導覽顯示新站名、頁尾有文字／Email／頁尾選單', html.includes(`測試站 ${RUN}`) && html.includes(`頁尾文字 ${RUN}`) && html.includes(`hi-${RUN}@example.com`) && html.includes(`隱私 ${RUN}`));
ok('GA 與主色注入', html.includes('googletagmanager.com/gtag/js?id=G-TEST1234') && html.includes('--accent:#0b6e77'));
ok('OG image 與 title', html.includes('og:image') && html.includes('https://example.com/og.png') && html.includes(`<title>測試站 ${RUN}</title>`));
// 清理：還原品牌名與區塊、頁尾
await act('update_settings', { settings: { 'brand.siteName': '', 'brand.tagline': '', 'seo.gaId': '', 'seo.ogImage': '', 'brand.footerText': '', 'brand.contactEmail': '', 'brand.facebook': '' } });
await act('set_home_sections', { sections: [] });
await act('set_menu', { location: 'footer', items: [] });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

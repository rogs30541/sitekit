// P30：前台 i18n——site.locale 切到 en 後前台（首頁導覽／商城／登入頁）出現英文並 html lang=en；切回 zh-TW 恢復繁中；網站設定含語言欄位
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
const untilHtml = async (url, pred, ms = 75000) => { // 站台設定走 ISR 資料快取，最長等一個 revalidate 週期
  const t0 = Date.now(); let html = '';
  while (Date.now() - t0 < ms) { html = await fetch(url, { headers: { 'cache-control': 'no-cache' } }).then((r) => r.text()).catch(() => ''); if (pred(html)) return html; await new Promise((r) => setTimeout(r, 500)); }
  return html;
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
ok('admin login', !!admin);
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });

const site0 = await j('/api/content/site');
ok('site 端點含 brand.locale（預設 zh-TW）', site0.status === 200 && ['zh-TW', 'en'].includes(site0.body.brand?.locale), String(site0.body.brand?.locale));
const fields = await j('/api/admin/site', { cookie: admin });
ok('網站設定欄位含 site.locale', fields.status === 200 && JSON.stringify(fields.body).includes('site.locale'));

// 切到英文
await act('update_settings', { settings: { 'site.locale': 'en' } });
const home = await untilHtml(`${W}/store`, (h) => h.includes('Store') && h.includes('lang="en"'));
ok('en：商城頁 html lang=en 且含英文（Store／Add to cart 或 No products）', home.includes('lang="en"') && (home.includes('Add to cart') || home.includes('No products yet') || home.includes('Store')), home.match(/<html[^>]*>/)?.[0]);
const login = await untilHtml(`${W}/login`, (h) => h.includes('Sign in') || h.includes('Forgot password'));
ok('en：登入頁出現 Sign in／Forgot password', login.includes('Sign in') || login.includes('Forgot password'));
const cart = await untilHtml(`${W}/cart`, (h) => h.includes('Your cart is empty') || h.includes('Checkout'));
ok('en：購物車頁（client component）出現英文', cart.includes('Your cart is empty') || cart.includes('Checkout'));
const siteEn = await j('/api/content/site');
ok('site.brand.locale=en', siteEn.body.brand?.locale === 'en');

// 切回繁中
await act('update_settings', { settings: { 'site.locale': 'zh-TW' } });
const back = await untilHtml(`${W}/login`, (h) => h.includes('忘記密碼') && h.includes('lang="zh-Hant"'));
ok('zh-TW：登入頁恢復繁中且 lang=zh-Hant', back.includes('忘記密碼') && back.includes('lang="zh-Hant"'), back.match(/<html[^>]*>/)?.[0]);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

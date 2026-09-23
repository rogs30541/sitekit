// P5 本機端到端：storage_status、send_test_notification（log provider）、事件通知（付款／出貨／退款）、媒體落地、AI 面板讀取
const B = process.env.API ?? 'http://localhost:4000';
const RUN = Date.now().toString(36).slice(-4).toLowerCase();
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const login = async (email, password) => (await j('/api/auth/login', { method: 'POST', body: { email, password } })).cookie;
const act = (cookie, action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie, body: { action, params } });

const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
const buyer = await login('tester@example.com', 'password123');
ok('logins', !!admin && !!buyer);

const st = await act(admin, 'storage_status');
ok('storage_status：local driver、log email', st.body.ok && st.body.data.storage.driver === 'local' && st.body.data.notify.emailProvider === 'log', JSON.stringify(st.body.data?.storage));
const setR2 = await act(admin, 'update_settings', { settings: { 'storage.driver': 's3', 's3.endpoint': 'https://example.r2.cloudflarestorage.com', 's3.bucket': 'b' } });
const st2 = await act(admin, 'storage_status');
ok('R2 缺金鑰 → 仍退回 local（s3Ready=false）', setR2.body.ok && st2.body.data.storage.driver === 'local' && st2.body.data.storage.s3Ready === false);
await act(admin, 'update_settings', { settings: { 'storage.driver': 'local' } });

const test = await act(admin, 'send_test_notification', { to: `t${RUN}@example.com` });
ok('send_test_notification：mail log OK、LINE 未設定略過', test.body.ok && test.body.data.mail.ok === true && test.body.data.mail.provider === 'log' && test.body.data.line.skipped, JSON.stringify(test.body.data));
const noTo = await act(admin, 'send_test_notification', {});
ok('無收件人 → mail skipped', noTo.body.ok && noTo.body.data.mail.skipped);

// 註冊 → 歡迎信
const reg = await j('/api/auth/register', { method: 'POST', body: { email: `p5-${RUN}@example.com`, password: 'p5-pass-123', displayName: 'P5' } });
ok('register', reg.status === 201);

// 付款 → 通知；出貨 → 通知；退款 → 通知
const products = (await j('/api/catalog/products?type=physical')).body;
const mug = products.find((p) => p.sku === 'DEMO-MUG');
const o = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], shipping: { name: 'P5', phone: '0911222333', address: '高雄市前鎮區中山二路 2 號' } } });
ok('order created', o.status === 201, o.body.merchantOrderNo);
const co = await j(`/api/payments/checkout/${o.body.id}`, { method: 'POST', cookie: buyer, body: { provider: 'mock' } });
const sig = new URL(co.body.redirectUrl).searchParams.get('sig');
await j('/api/payments/mock/notify', { method: 'POST', body: { order: o.body.merchantOrderNo, sig, result: 'success' } });
await act(admin, 'update_shipping', { orderNo: o.body.merchantOrderNo, status: 'shipped', carrier: '宅配通', trackingNo: `P5${RUN}` });
await j(`/api/admin/payments/refund/${o.body.merchantOrderNo}`, { method: 'POST', cookie: admin, body: { approve: true } });
await new Promise((r) => setTimeout(r, 800));
const st3 = await act(admin, 'storage_status');
const kinds = st3.body.data.recent.map((r) => r.kind);
ok('通知紀錄含 welcome／order_paid／order_paid_admin(line skipped)／order_shipped／order_refunded', ['welcome', 'order_paid', 'order_paid_admin', 'order_shipped', 'order_refunded'].every((k) => kinds.includes(k)), JSON.stringify(kinds.slice(0, 8)));
ok('買家 order_paid 收件人正確', st3.body.data.recent.some((r) => r.kind === 'order_paid' && r.to === 'tester@example.com' && r.result.ok));

// 媒體落地：CSV 內文含本機圖片網址（web dev server 的 favicon）
const img = 'http://localhost:4000/api/assets/ai/cmuangv540001or1gf8xu0amd.svg';
const csv = `external_id,title,slug,body,published_at,original_url,cover_url\np5-${RUN},媒體落地測試 ${RUN},media-${RUN},"<p>hi</p><img src=""${img}""><img src=""https://invalid.invalid/none.png"">",2026-09-01,https://old.example.com/2026/09/media-${RUN},${img}`;
const dry = await act(admin, 'import_content', { source: 'csv', csv, dryRun: true, landMedia: true });
ok('import_content 乾跑回 mediaCount', dry.body.ok && dry.body.data.mediaCount === 3, JSON.stringify(dry.body.data));
const imp = await act(admin, 'import_content', { source: 'csv', csv, dryRun: false, landMedia: true });
ok('媒體落地：同網址只下載 1 次、壞網址 1 失敗', imp.body.ok && imp.body.data.media?.downloaded === 1 && imp.body.data.media?.failed === 1, JSON.stringify(imp.body.data));
const post = await j(`/api/content/posts/media-${RUN}`);
ok('內文與封面已改寫成 /api/assets/media/…', post.status === 200 && /\/api\/assets\/media\/[a-f0-9]{40}\.(svg|bin|png)/.test(post.body.body ?? '') && /\/api\/assets\/media\//.test(post.body.coverUrl ?? '') && post.body.body.includes('invalid.invalid'), `${post.body.coverUrl}`);
if (post.status === 200) {
  const m = (post.body.coverUrl ?? '').match(/\/api\/assets\/media\/[^"']+/);
  const asset = m ? await fetch(B + m[0]) : null;
  ok('落地檔案可由 /api/assets 讀取', !!asset && asset.status === 200 && Number(asset.headers.get('content-length')) > 0);
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

// P18 本機端到端：電商／課程分流——訂單 scope 自動判定與禁止混合、折扣碼範疇、訂單列表／報表依範疇、銷售頁掛課程（courseSlug）、OPS list_orders scope
const B = process.env.API ?? 'http://localhost:4000';
const RUN = Date.now().toString(36).slice(-4).toLowerCase();
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
const buyer = (await j('/api/auth/login', { method: 'POST', body: { email: 'tester@example.com', password: 'password123' } })).cookie;
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
ok('logins', !!admin && !!buyer);
await act('update_settings', { settings: { 'payment.provider': 'mock', 'payment.methods': 'mock,newebpay', 'logistics.provider': 'ecpay', 'logistics.methods': 'manual,UNIMARTC2C,TCAT', 'shipping.fee': '80' } });
const products = (await j('/api/admin/catalog/products', { cookie: admin })).body;
const mug = products.find((p) => p.sku === 'DEMO-MUG');
const courseProduct = products.find((p) => p.type === 'course' && p.isActive);
ok('有商品與課程商品', !!mug && !!courseProduct, JSON.stringify({ mug: !!mug, course: courseProduct?.sku }));

// 1. 混合結帳 → 400；純課程 → scope course；純商品 → scope shop
const mixed = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }, { productId: courseProduct.id, qty: 1 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' } } });
ok('課程＋商品混合 → 400', mixed.status === 400 && String(mixed.body.message).includes('分開'), JSON.stringify(mixed.body).slice(0, 100));
const cq = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: courseProduct.id, qty: 1 }] } });
ok('純課程試算 scope=course、免運', cq.status === 201 && cq.body.scope === 'course' && cq.body.needsShipping === false, JSON.stringify(cq.body).slice(0, 120));
const sq = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' } } });
ok('純商品試算 scope=shop', sq.status === 201 && sq.body.scope === 'shop');

// 2. 折扣碼範疇
const cc = await act('manage_coupon', { op: 'create', code: `CRS${RUN.toUpperCase()}`, type: 'percent', value: 10, scope: 'course' });
ok('建立課程折扣碼', cc.body.ok && cc.body.data.scope === 'course', JSON.stringify(cc.body).slice(0, 120));
const sc = await act('manage_coupon', { op: 'create', code: `SHP${RUN.toUpperCase()}`, type: 'fixed', value: 50 });
ok('建立電商折扣碼（預設 shop）', sc.body.ok && sc.body.data.scope === 'shop');
const ac = await act('manage_coupon', { op: 'create', code: `ALL${RUN.toUpperCase()}`, type: 'fixed', value: 30, scope: 'all' });
ok('建立通用折扣碼', ac.body.ok && ac.body.data.scope === 'all');
const wrong = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: courseProduct.id, qty: 1 }], couponCode: `SHP${RUN.toUpperCase()}` } });
ok('課程訂單用電商折扣碼 → 400', wrong.status === 400 && String(wrong.body.message).includes('商品訂單'));
const right = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: courseProduct.id, qty: 1 }], couponCode: `CRS${RUN.toUpperCase()}` } });
ok('課程訂單用課程折扣碼 → 折 10%', right.status === 201 && right.body.discount === Math.floor(courseProduct.price * 0.1));
const both = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], couponCode: `ALL${RUN.toUpperCase()}`, shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' } } });
ok('通用折扣碼可用於商品', both.status === 201 && both.body.discount === 30);
const listShop = (await j('/api/admin/coupons?scope=shop', { cookie: admin })).body;
const listCourse = (await j('/api/admin/coupons?scope=course', { cookie: admin })).body;
ok('折扣碼列表依範疇（含通用）', listShop.some((c) => c.code === `SHP${RUN.toUpperCase()}`) && listShop.some((c) => c.code === `ALL${RUN.toUpperCase()}`) && !listShop.some((c) => c.code === `CRS${RUN.toUpperCase()}`) && listCourse.some((c) => c.code === `CRS${RUN.toUpperCase()}`) && !listCourse.some((c) => c.code === `SHP${RUN.toUpperCase()}`));

// 3. 建立課程訂單與商品訂單 → 列表依 scope
const co = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: courseProduct.id, qty: 1 }], couponCode: `CRS${RUN.toUpperCase()}` } });
ok('建立課程訂單 scope=course', co.status === 201 && co.body.scope === 'course', JSON.stringify(co.body).slice(0, 120));
const so = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' } } });
ok('建立商品訂單 scope=shop', so.status === 201 && so.body.scope === 'shop');
const lc = (await j('/api/admin/orders?scope=course', { cookie: admin })).body;
const ls = (await j('/api/admin/orders?scope=shop', { cookie: admin })).body;
ok('後台訂單列表依範疇', lc.some((o) => o.id === co.body.id) && !lc.some((o) => o.id === so.body.id) && ls.some((o) => o.id === so.body.id) && !ls.some((o) => o.id === co.body.id));
const opsList = await act('list_orders', { scope: 'course', limit: 5 });
ok('OPS list_orders scope=course', opsList.body.ok && opsList.body.data.every((o) => o.scope === 'course'));
const rep = await act('sales_report', { scope: 'course', from: new Date(Date.now() - 86400000).toISOString().slice(0, 10) });
ok('sales_report scope=course 可查', rep.body.ok && typeof rep.body.data.summary.orders === 'number');
const csv = await fetch(`${B}/api/admin/orders/export.csv?scope=course`, { headers: { cookie: admin } });
ok('對帳檔 scope=course', csv.status === 200);

// 4. 銷售頁掛課程 → 前台快照含 courseSlug
const sp = await j('/api/admin/sales', { method: 'POST', cookie: admin, body: { title: `課程銷售頁 ${RUN}`, slug: `course-sale-${RUN}` } });
await j(`/api/admin/sales/${sp.body.page.id}/draft`, { method: 'PUT', cookie: admin, body: { doc: { items: [{ productId: courseProduct.id, kind: 'offer', order: 0 }, { productId: mug.id, kind: 'product', order: 1 }] } } });
await j(`/api/admin/sales/${sp.body.page.id}/publish`, { method: 'POST', cookie: admin, body: { confirm: true } });
const pub = await j(`/api/sales/course-sale-${RUN}`);
const courseItem = pub.body.items?.find((i) => i.productId === courseProduct.id);
ok('銷售頁可掛課程並回 courseSlug', pub.status === 200 && courseItem && courseItem.product.type === 'course' && typeof courseItem.product.courseSlug === 'string', JSON.stringify(courseItem?.product).slice(0, 160));

// 清理
await j(`/api/admin/sales/${sp.body.page.id}`, { method: 'DELETE', cookie: admin });
for (const code of [`CRS${RUN.toUpperCase()}`, `SHP${RUN.toUpperCase()}`, `ALL${RUN.toUpperCase()}`]) await act('manage_coupon', { op: 'disable', code });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

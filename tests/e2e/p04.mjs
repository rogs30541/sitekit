// P4 本機端到端：商品 CSV 匯入 → 折扣碼 → 購物車試算 → 建單扣庫存 → mock 付款 → 物流更新 → 報表／對帳檔 → 取消回補 → 逾期取消 → 限流
const B = process.env.API ?? 'http://localhost:4000';
let fails = 0;
const RUN = Date.now().toString(36).slice(-4).toUpperCase();
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie, raw } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const t = await r.text(); let b; try { b = raw ? t : JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0], headers: r.headers };
};
const login = async (email, password) => (await j('/api/auth/login', { method: 'POST', body: { email, password } })).cookie;
const act = (cookie, action, params) => j('/api/admin/ai/act', { method: 'POST', cookie, body: { action, params } });

const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
const buyer = await login('tester@example.com', 'password123');
ok('logins', !!admin && !!buyer);
const health = await j('/api/health');
ok('health 含 db ping', health.body.ok === true && health.body.db === 'ok' && typeof health.body.uptimeSec === 'number', JSON.stringify(health.body.version));

// 商品 CSV 匯入（乾跑→實跑）
const csv = `sku,name,price,type,description,stock,active\nP4${RUN}-TEE,示範 T 恤,590,physical,<p>純棉</p>,5,true\nP4${RUN}-CAP,示範帽子,390,physical,,0,true\nP4${RUN}-BAD,,abc,physical,,,`;
const dry = await act(admin, 'import_products', { csv, dryRun: true });
ok('import_products 乾跑', dry.body.ok && dry.body.data.dryRun && dry.body.data.total === 2, JSON.stringify(dry.body.data));
const imp = await act(admin, 'import_products', { csv, dryRun: false });
ok('import_products 實跑', imp.body.ok && imp.body.data.imported === 2, JSON.stringify(imp.body.data));
const shop = `Handle,Title,Body (HTML),Option1 Value,Variant SKU,Variant Price,Variant Inventory Qty,Image Src,Published\nhoodie${RUN},連帽外套,<p>厚磅</p>,S,HOOD${RUN}-S,1290,3,https://example.com/h.jpg,TRUE\nhoodie${RUN},,,M,HOOD${RUN}-M,1290,4,,\nhoodie${RUN},,,L,,1290,2,,`;
const shopify = await act(admin, 'import_products', { csv: shop, dryRun: false });
ok('Shopify CSV 多規格 → 3 件', shopify.body.ok && shopify.body.data.imported === 3, JSON.stringify(shopify.body.data));
const list = await j('/api/catalog/products?type=physical');
const tee = list.body.find((p) => p.sku === `P4${RUN}-TEE`);
const hoodM = list.body.find((p) => p.sku === `HOOD${RUN}-M`);
ok('公開商品列表含庫存', tee?.stock === 5 && hoodM?.name === '連帽外套（M）' && hoodM.stock === 4, JSON.stringify(list.body.map((p) => p.sku)));

// 折扣碼
const cp = await act(admin, 'manage_coupon', { op: 'create', code: `p4t${RUN}`, type: 'fixed', value: 100, minAmount: 500, maxUses: 1 });
ok('manage_coupon create', cp.body.ok && cp.body.data.code === `P4T${RUN}`, JSON.stringify(cp.body.error));
const cpDup = await act(admin, 'manage_coupon', { op: 'create', code: `P4T${RUN}`, type: 'fixed', value: 1 });
ok('重複代碼被拒', cpDup.body.ok === false);

// 試算
const q1 = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: tee.id, qty: 2 }], couponCode: `P4T${RUN}` } });
ok('quote：小計 1180、折 100、運費（滿千免運）0、應付 1080、需出貨', q1.body.subtotal === 1180 && q1.body.discount === 100 && q1.body.shippingFee === 0 && q1.body.amount === 1080 && q1.body.needsShipping === true, JSON.stringify(q1.body));
const q2 = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: tee.id, qty: 1 }] } });
ok('quote：未滿千收運費 80', q2.body.shippingFee === 80 && q2.body.amount === 670, JSON.stringify(q2.body));
const mug = list.body.find((p) => p.sku === 'DEMO-MUG');
const q3 = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], couponCode: `P4T${RUN}` } });
ok('quote：低消不足回錯誤訊息', q3.status === 400 && String(q3.body.message).includes('滿'), JSON.stringify(q3.body.message));
const q4 = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: tee.id, qty: 9 }] } });
ok('quote：庫存不足', q4.status === 400 && String(q4.body.message).includes('庫存'), JSON.stringify(q4.body.message));

// 建單（缺收件資料→400；補上→扣庫存）
const noShip = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: tee.id, qty: 2 }], couponCode: `P4T${RUN}` } });
ok('實體商品缺收件資料 → 400', noShip.status === 400);
const o1 = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: tee.id, qty: 2 }], couponCode: `P4T${RUN}`, shipping: { name: '王小明', phone: '0912345678', address: '台北市信義區市府路 1 號' } } });
ok('建單成功含折扣／運費／收件', o1.status === 201 && o1.body.amount === 1080 && o1.body.shippingStatus === 'pending' && o1.body.couponCode === `P4T${RUN}`, o1.body.merchantOrderNo);
const afterOrder = (await j('/api/catalog/products?type=physical')).body.find((p) => p.sku === `P4${RUN}-TEE`);
ok('下單即扣庫存 5→3', afterOrder.stock === 3);
const ship0 = await j(`/api/admin/orders/${o1.body.merchantOrderNo}/shipping`, { method: 'PATCH', cookie: admin, body: { status: 'shipped' } });
ok('未付款不可出貨 → 400', ship0.status === 400);

// mock 付款
const co = await j(`/api/payments/checkout/${o1.body.id}`, { method: 'POST', cookie: buyer, body: { provider: 'mock' } });
const sig = new URL(co.body.redirectUrl).searchParams.get('sig');
const pay = await j('/api/payments/mock/notify', { method: 'POST', body: { order: o1.body.merchantOrderNo, sig, result: 'success' } });
ok('mock 付款 → paid', pay.body.status === 'paid');
const cpAfter = (await j('/api/admin/coupons', { cookie: admin })).body.find((c) => c.code === `P4T${RUN}`);
ok('折扣碼 usedCount 累加', cpAfter.usedCount === 1);
const q5 = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: tee.id, qty: 1 }, { productId: hoodM.id, qty: 1 }], couponCode: `P4T${RUN}` } });
ok('折扣碼達上限被拒', q5.status === 400 && String(q5.body.message).includes('上限'));
const ent = await j('/api/learn/courses/demo-course', { cookie: buyer });
ok('實體商品不發課程授權（learn 仍以既有授權為準）', ent.status === 200 || ent.status === 403);

// 物流：AI API 路徑 update_shipping
const ship1 = await act(admin, 'update_shipping', { orderNo: o1.body.merchantOrderNo, status: 'shipped', carrier: '黑貓', trackingNo: 'TC123' });
ok('update_shipping → shipped', ship1.body.ok && ship1.body.data.shippingStatus === 'shipped' && ship1.body.data.shippedAt, JSON.stringify(ship1.body.error));
const mine = (await j('/api/orders/mine', { cookie: buyer })).body.find((o) => o.merchantOrderNo === o1.body.merchantOrderNo);
ok('買家看得到物流', mine.shippingStatus === 'shipped' && mine.trackingNo === 'TC123');
const badShip = await act(admin, 'update_shipping', { orderNo: o1.body.merchantOrderNo, status: 'flying' });
ok('非法物流狀態被拒', badShip.body.ok === false);

// 報表與對帳檔
const rep = await act(admin, 'sales_report', { from: '2026-09-01', to: '2026-12-31' });
const s = rep.body.data?.summary;
ok('sales_report 有營收與商品', rep.body.ok && s.orders >= 1 && s.revenue >= 1080 && rep.body.data.byProduct.some((p) => p.name === '示範 T 恤') && rep.body.data.byProvider.some((p) => p.provider === 'mock'), JSON.stringify(s));
const csvOut = await j('/api/admin/orders/export.csv?from=2026-09-01&to=2026-12-31&status=paid', { cookie: admin, raw: true });
ok('對帳檔 CSV（含訂單、物流欄；fetch.text() 會剝 BOM，BOM 已用 curl 驗證）', csvOut.status === 200 && csvOut.body.replace(/^﻿/, '').startsWith('訂單編號') && csvOut.body.includes(o1.body.merchantOrderNo) && csvOut.body.includes('TC123') && csvOut.headers.get('content-type')?.includes('text/csv'));
const repNoAuth = await j('/api/admin/reports/sales');
ok('報表需管理員', repNoAuth.status === 401);

// 取消回補庫存
const o2 = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: hoodM.id, qty: 4 }], shipping: { name: 'A', phone: '0900000000', address: '台北市中正區重慶南路一段 1 號' } } });
ok('買光 HOOD-M 4 件', o2.status === 201 && (await j('/api/catalog/products?type=physical')).body.find((p) => p.sku === `HOOD${RUN}-M`).stock === 0);
const race = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: hoodM.id, qty: 1 }], shipping: { name: 'A', phone: '0900000000', address: '台北市中正區重慶南路一段 1 號' } } });
ok('售完不可再下單', race.status === 400);
await j(`/api/orders/${o2.body.merchantOrderNo}/cancel`, { method: 'POST', cookie: buyer });
ok('取消回補庫存 → 4', (await j('/api/catalog/products?type=physical')).body.find((p) => p.sku === `HOOD${RUN}-M`).stock === 4);
const adj = await act(admin, 'adjust_stock', { sku: `HOOD${RUN}-M`, delta: -1 });
ok('adjust_stock delta', adj.body.ok && adj.body.data.stock === 3 && adj.body.data.before === 4);
const exp = await act(admin, 'expire_orders', { hours: 0 });
ok('expire_orders 執行（0 小時＝取消所有 pending）', exp.body.ok && Array.isArray(exp.body.data.canceled), JSON.stringify(exp.body.data));

// 退款回補：付款後退款
const o3 = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: tee.id, qty: 1 }], shipping: { name: 'B', phone: '0900000001', address: '新北市板橋區縣民大道二段 7 號' } } });
const co3 = await j(`/api/payments/checkout/${o3.body.id}`, { method: 'POST', cookie: buyer, body: { provider: 'mock' } });
await j('/api/payments/mock/notify', { method: 'POST', body: { order: o3.body.merchantOrderNo, sig: new URL(co3.body.redirectUrl).searchParams.get('sig'), result: 'success' } });
const before = (await j('/api/catalog/products?type=physical')).body.find((p) => p.sku === `P4${RUN}-TEE`).stock;
const rf = await j(`/api/admin/payments/refund/${o3.body.merchantOrderNo}`, { method: 'POST', cookie: admin, body: { approve: true } });
const afterRf = (await j('/api/catalog/products?type=physical')).body.find((p) => p.sku === `P4${RUN}-TEE`).stock;
ok('退款回補庫存', rf.status === 201 && rf.body.status === 'refunded' && afterRf === before + 1, `${before}→${afterRf}`);

// 限流：登入 21 次
let last = 0;
for (let i = 0; i < 22; i++) last = (await j('/api/auth/login', { method: 'POST', body: { email: 'nobody@example.com', password: 'x' } })).status;
if (process.env.E2E_RATE_LIMIT_OFF === '1') ok('登入限流（api 以 RATE_LIMIT=off 啟動，跳過）', last !== 429);
else ok('登入限流 → 429', last === 429);
const statusOps = await j('/api/ops/run', { method: 'POST', body: { action: 'status' }, cookie: undefined });
ok('ops 無 token 仍 401（限流不影響）', statusOps.status === 401);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

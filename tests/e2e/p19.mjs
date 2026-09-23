// P19 本機端到端：商品刪除（無訂單可刪／有訂單拒絕）、多規格（設定／公開列表／試算指定規格價格庫存／未選規格拒絕／下單扣規格庫存／取消回補）、課程建立、OPS set_product_variants／delete_product、銷售頁含 variants
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
await act('update_settings', { settings: { 'logistics.provider': 'ecpay', 'logistics.methods': 'manual', 'shipping.fee': '0' } });

// 1. 建立商品 → 設定規格
const sku = `TEE-${RUN.toUpperCase()}`;
const c = await j('/api/admin/catalog/products', { method: 'POST', cookie: admin, body: { type: 'physical', sku, name: `規格 T 恤 ${RUN}`, price: 500, stock: null, coverUrl: '' } });
ok('建立商品', c.status === 201, JSON.stringify(c.body).slice(0, 100));
const pid = c.body.id;
const vs = await j(`/api/admin/catalog/products/${pid}/variants`, { method: 'PUT', cookie: admin, body: { specs: [{ name: '顏色', values: ['黑', '白'] }, { name: '尺寸', values: ['S', 'M'] }], variants: [{ name: '黑 / S', sku: `${sku}-1`, price: null, stock: 2, options: { 顏色: '黑', 尺寸: 'S' } }, { name: '黑 / M', sku: `${sku}-2`, price: 550, stock: 0, options: { 顏色: '黑', 尺寸: 'M' } }, { name: '白 / S', sku: `${sku}-3`, price: null, stock: null, options: { 顏色: '白', 尺寸: 'S' } }] } });
ok('設定 3 個規格組合', vs.status === 200 && vs.body.variants.length === 3 && vs.body.specs.length === 2, JSON.stringify(vs.body).slice(0, 160));
const dupSku = await j(`/api/admin/catalog/products/${pid}/variants`, { method: 'PUT', cookie: admin, body: { specs: [], variants: [{ name: 'a', sku: 'X' }, { name: 'b', sku: 'X' }] } });
ok('規格 SKU 重複 → 400', dupSku.status === 400);
const detail = await j(`/api/admin/catalog/products/${pid}`, { cookie: admin });
ok('後台商品詳情含 variants／specs', detail.status === 200 && detail.body.variants.length === 3 && detail.body.specs[0].name === '顏色');
const pub = (await j('/api/catalog/products')).body.find((p) => p.id === pid);
ok('公開列表含啟用規格（價格 null／庫存）', pub && pub.variants.length === 3 && pub.variants[0].stock === 2 && pub.variants[1].price === 550);
const black_s = pub.variants.find((v) => v.sku === `${sku}-1`);
const black_m = pub.variants.find((v) => v.sku === `${sku}-2`);
const white_s = pub.variants.find((v) => v.sku === `${sku}-3`);

// 2. 試算：未選規格拒絕；規格價格；售完規格拒絕；規格庫存不足
const noV = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: pid, qty: 1 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' } } });
ok('有規格商品未選規格 → 400', noV.status === 400 && String(noV.body.message).includes('規格'));
const qM = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: pid, variantId: black_m.id, qty: 1 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' } } });
ok('售完規格 → 400', qM.status === 400 && String(qM.body.message).includes('庫存'));
const qW = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: pid, variantId: white_s.id, qty: 3 }, { productId: pid, variantId: black_s.id, qty: 1 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' } } });
ok('同商品兩規格：白 S 沿用主價 500×3、黑 S 500×1，名稱含規格', qW.status === 201 && qW.body.subtotal === 2000 && qW.body.items.length === 2 && qW.body.items[0].name.includes('（白 / S）') && qW.body.items[0].variantId === white_s.id, JSON.stringify(qW.body.items));
const qOver = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: pid, variantId: black_s.id, qty: 3 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' } } });
ok('規格庫存不足 → 400', qOver.status === 400 && String(qOver.body.message).includes('剩 2'));

// 3. 下單扣規格庫存、取消回補
const o = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: pid, variantId: black_s.id, qty: 2 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' } } });
ok('下單（黑 S ×2）', o.status === 201 && o.body.items[0].variantId === black_s.id, JSON.stringify(o.body).slice(0, 120));
let after = (await j('/api/catalog/products')).body.find((p) => p.id === pid);
ok('規格庫存扣為 0', after.variants.find((v) => v.id === black_s.id).stock === 0);
const cancel = await j(`/api/orders/${o.body.id}/cancel`, { method: 'POST', cookie: buyer });
after = (await j('/api/catalog/products')).body.find((p) => p.id === pid);
ok('取消訂單回補規格庫存', cancel.status < 300 && after.variants.find((v) => v.id === black_s.id).stock === 2, JSON.stringify(cancel.body).slice(0, 80));

// 4. 刪除：有訂單紀錄 → 400；新品可刪；規格覆寫時已有訂單的規格改下架
const delBusy = await j(`/api/admin/catalog/products/${pid}`, { method: 'DELETE', cookie: admin });
ok('有訂單紀錄的商品不可刪', delBusy.status === 400 && String(delBusy.body.message).includes('下架'));
const vs2 = await j(`/api/admin/catalog/products/${pid}/variants`, { method: 'PUT', cookie: admin, body: { specs: [{ name: '顏色', values: ['白'] }], variants: [{ id: white_s.id, name: '白 / S', sku: `${sku}-3`, price: 480, stock: 5, options: { 顏色: '白', 尺寸: 'S' } }] } });
const stillBlack = vs2.body.variants.find((v) => v.id === black_s.id);
ok('覆寫規格：已有訂單的黑 S 改為下架而非刪除、白 S 更新價格', vs2.status === 200 && stillBlack && stillBlack.isActive === false && vs2.body.variants.find((v) => v.id === white_s.id).price === 480 && !vs2.body.variants.some((v) => v.id === black_m.id));
const fresh = await j('/api/admin/catalog/products', { method: 'POST', cookie: admin, body: { type: 'physical', sku: `TMP-${RUN.toUpperCase()}`, name: '暫時商品', price: 10, coverUrl: '' } });
const delOk = await j(`/api/admin/catalog/products/${fresh.body.id}`, { method: 'DELETE', cookie: admin });
ok('無訂單商品可刪除', delOk.status === 200 && delOk.body.deleted === `TMP-${RUN.toUpperCase()}`);
const opsDel = await act('delete_product', { sku: 'NOPE-SKU' });
ok('OPS delete_product 不存在 → error', !opsDel.body.ok);
const opsV = await act('set_product_variants', { sku, specs: [{ name: '顏色', values: ['白', '紅'] }], variants: [{ id: white_s.id, name: '白 / S', sku: `${sku}-3`, price: 480, stock: 5 }, { name: '紅', sku: `${sku}-R`, price: null, stock: 1 }] });
ok('OPS set_product_variants', opsV.body.ok && opsV.body.data.variants.some((v) => v.sku === `${sku}-R`));

// 5. 課程建立（後台按鈕同一 API）
const cs = await j('/api/admin/catalog/courses', { method: 'POST', cookie: admin, body: { slug: `new-course-${RUN}`, summary: '摘要', isPublished: false, product: { sku: `COURSE-NEW-${RUN.toUpperCase()}`, name: `新課程 ${RUN}`, price: 990, description: null, coverUrl: '' } } });
ok('建立課程（含商品）', cs.status === 201 && cs.body.product.type === 'course' && cs.body.isPublished === false, JSON.stringify(cs.body).slice(0, 120));
const courseDel = await j(`/api/admin/catalog/products/${cs.body.product.id}`, { method: 'DELETE', cookie: admin });
ok('課程商品不可從商品刪除', courseDel.status === 400);

// 6. 銷售頁掛有規格商品 → 前台快照含 variants
const sp = await j('/api/admin/sales', { method: 'POST', cookie: admin, body: { title: `規格銷售頁 ${RUN}`, slug: `variant-sale-${RUN}` } });
await j(`/api/admin/sales/${sp.body.page.id}/draft`, { method: 'PUT', cookie: admin, body: { doc: { items: [{ productId: pid, kind: 'product', order: 0 }] } } });
await j(`/api/admin/sales/${sp.body.page.id}/publish`, { method: 'POST', cookie: admin, body: { confirm: true } });
const live = await j(`/api/sales/variant-sale-${RUN}`);
ok('銷售頁快照含啟用規格', live.status === 200 && live.body.items[0].product.variants.length === 2 && live.body.items[0].product.variants.every((v) => v.name));

// 清理
await j(`/api/admin/sales/${sp.body.page.id}`, { method: 'DELETE', cookie: admin });
await j(`/api/admin/catalog/products/${pid}`, { method: 'PATCH', cookie: admin, body: { isActive: false } });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

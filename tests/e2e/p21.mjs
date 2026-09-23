// P21 本機端到端：特價排程（effectivePrice 進試算／公開列表）、隱藏商品／課程不在列表但可直連、課程新欄位（講師／發布時間／購買備註／按鈕文字）、模型偵測端點（mock／無金鑰）
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
ok('logins', !!admin && !!buyer);
await j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action: 'update_settings', params: { settings: { 'logistics.provider': 'ecpay', 'logistics.methods': 'manual', 'shipping.fee': '0', 'ai.commandProvider': 'mock' } } } });

// 1. 特價：排程內生效、排程外不生效
const sku = `SALE-${RUN.toUpperCase()}`;
const c = await j('/api/admin/catalog/products', { method: 'POST', cookie: admin, body: { type: 'physical', sku, name: `特價品 ${RUN}`, price: 1000, salePrice: 800, saleStartsAt: new Date(Date.now() - 3600000).toISOString(), saleEndsAt: new Date(Date.now() + 3600000).toISOString(), coverUrl: '' } });
ok('建立特價商品', c.status === 201 && c.body.salePrice === 800, JSON.stringify(c.body).slice(0, 100));
const q1 = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: c.body.id, qty: 2 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' } } });
ok('試算用特價 800×2', q1.status === 201 && q1.body.subtotal === 1600 && q1.body.items[0].unitPrice === 800, JSON.stringify(q1.body.items));
await j(`/api/admin/catalog/products/${c.body.id}`, { method: 'PATCH', cookie: admin, body: { saleEndsAt: new Date(Date.now() - 60000).toISOString() } });
const q2 = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: c.body.id, qty: 1 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' } } });
ok('特價過期回原價 1000', q2.status === 201 && q2.body.items[0].unitPrice === 1000);
const pubList = (await j('/api/catalog/products')).body;
ok('公開列表含特價欄位', pubList.find((p) => p.id === c.body.id)?.salePrice === 800);

// 2. 隱藏
await j(`/api/admin/catalog/products/${c.body.id}`, { method: 'PATCH', cookie: admin, body: { hidden: true } });
ok('隱藏商品不在公開列表', !(await j('/api/catalog/products')).body.some((p) => p.id === c.body.id));
const q3 = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: c.body.id, qty: 1 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' } } });
ok('隱藏商品仍可下單（直連）', q3.status === 201);

// 3. 課程新欄位
const cs = await j('/api/admin/catalog/courses', { method: 'POST', cookie: admin, body: { slug: `pc-${RUN}`, isPublished: true, instructorName: '度哥', instructorBio: '創業路', purchaseNote: '含講義', buttonText: '立即加入', publishedAt: new Date().toISOString(), product: { sku: `COURSE-PC-${RUN.toUpperCase()}`, name: `課程 ${RUN}`, price: 1990, salePrice: 1490, description: null, coverUrl: '', category: '創業', tags: ['AI', '行銷'] } } });
ok('課程建立含講師／備註／按鈕／特價／標籤', cs.status === 201 && cs.body.instructorName === '度哥' && cs.body.product.salePrice === 1490 && cs.body.product.tags.length === 2, JSON.stringify(cs.body).slice(0, 160));
const courses = (await j('/api/catalog/courses')).body;
const mine = courses.find((x) => x.slug === `pc-${RUN}`);
ok('公開課程列表含講師與特價欄位', mine && mine.instructorName === '度哥' && mine.product.salePrice === 1490);
const detail = await j(`/api/catalog/courses/pc-${RUN}`);
ok('課程詳情含 purchaseNote／buttonText', detail.status === 200 && detail.body.purchaseNote === '含講義' && detail.body.buttonText === '立即加入');
const cq = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: cs.body.productId, qty: 1 }] } });
ok('課程試算用特價 1490', cq.status === 201 && cq.body.items[0].unitPrice === 1490);
await j(`/api/admin/catalog/courses/${cs.body.id}`, { method: 'PATCH', cookie: admin, body: { product: { hidden: true } } });
ok('隱藏課程不在列表但詳情可讀', !(await j('/api/catalog/courses')).body.some((x) => x.slug === `pc-${RUN}`) && (await j(`/api/catalog/courses/pc-${RUN}`)).status === 200);

// 4. 模型偵測
const mm = await j('/api/admin/ai/command/models', { method: 'POST', cookie: admin, body: { provider: 'mock' } });
ok('models：mock 回規則模式', mm.status === 201 && mm.body.models[0].id === 'rules');
const ma = await j('/api/admin/ai/command/models', { method: 'POST', cookie: admin, body: { provider: 'anthropic', apiKey: '' } });
ok('models：anthropic 無金鑰回錯誤與預設', ma.status === 201 && Array.isArray(ma.body.models) && ma.body.default === 'claude-sonnet-5' && typeof ma.body.error === 'string', JSON.stringify(ma.body).slice(0, 120));
const mb = await j('/api/admin/ai/command/models', { method: 'POST', cookie: admin, body: { provider: 'openai', apiKey: 'sk-invalid' } });
ok('models：openai 無效金鑰回錯誤（不炸）', mb.status === 201 && mb.body.error && mb.body.models.length === 0, JSON.stringify(mb.body).slice(0, 120));

// 清理
await j(`/api/admin/catalog/products/${c.body.id}`, { method: 'PATCH', cookie: admin, body: { isActive: false } });
await j(`/api/admin/catalog/courses/${cs.body.id}`, { method: 'PATCH', cookie: admin, body: { isPublished: false } });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

// needs: web
// P16 本機端到端：一頁式銷售頁——建立／草稿深度合併／掛商品／內文設計文件／檢測／預覽 token／confirm 發佈備份／前台快照（排程／密碼／下架）／還原／OPS 防呆／前台頁面
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
ok('admin login', !!admin);
const products = (await j('/api/admin/catalog/products', { cookie: admin })).body;
const mug = products.find((p) => p.sku === 'DEMO-MUG');
const tee = products.find((p) => p.sku !== 'DEMO-MUG' && p.type === 'physical' && p.isActive);
ok('有示範商品', !!mug && !!tee);

// 1. 建立 → 草稿預設值
const c = await j('/api/admin/sales', { method: 'POST', cookie: admin, body: { title: `秋季限定 ${RUN}`, slug: `autumn-${RUN}`, code: 'AU' } });
ok('建立銷售頁（草稿、預設文件）', c.status === 201 && c.body.page.status === 'draft' && c.body.doc.sections.order.length === 7 && c.body.doc.form.mode === 'multi' && c.body.preview.url.includes('/preview/sales/'), JSON.stringify(c.body).slice(0, 160));
const id = c.body.page.id;
const codeBad = await j('/api/admin/sales', { method: 'POST', cookie: admin, body: { title: 'x', code: 'abcd' } });
ok('前綴不合法 → 400', codeBad.status === 400);

// 2. 草稿深度合併：通知／倒數／掛商品／內文／密碼
const design = { root: { type: 'root', children: [{ type: 'section', props: {}, children: [{ type: 'heading', props: { level: 1, text: `秋季限定 ${RUN}` } }, { type: 'text', props: { text: '三大賣點' } }, { type: 'addtocart', props: { text: '立即選購' } }] }] } };
const s1 = await j(`/api/admin/sales/${id}/draft`, { method: 'PUT', cookie: admin, body: { doc: { notice: { enabled: true, text: '滿千免運' }, countdown: { enabled: true, endsAt: new Date(Date.now() + 86400000).toISOString() }, content: design, items: [{ productId: mug.id, kind: 'offer', order: 0, badge: '主打' }, { productId: tee.id, kind: 'product', order: 1 }, { productId: 'nope', kind: 'product', order: 2 }], access: { passwordEnabled: false, password: 'secret' }, theme: { primaryColor: '#e11d48' }, contact: { line: '@demo' } } } });
ok('存草稿：深度合併（通知／倒數保留其他預設）、不存在商品被剔除、密碼雜湊', s1.status === 200 && s1.body.doc.notice.enabled && s1.body.doc.countdown.text === '優惠倒數中' && s1.body.doc.items.length === 2 && s1.body.doc.access.password === '••••••' && s1.body.doc.theme.primaryColor === '#e11d48' && s1.body.doc.form.mode === 'multi', JSON.stringify(s1.body.doc.items));
ok('內文設計文件已補 id、addtocart 區塊存在', s1.body.doc.content.root.children[0].id && JSON.stringify(s1.body.doc.content).includes('addtocart'));
ok('掛載商品解析（products 含名稱／價格）', s1.body.products.length === 2 && s1.body.products.some((p) => p.id === mug.id && p.name));
ok('dirty＝有未發佈變更、lint 無 error', s1.body.dirty === true && !s1.body.lint.some((l) => l.level === 'error'), JSON.stringify(s1.body.lint));
const badDesign = await j(`/api/admin/sales/${id}/draft`, { method: 'PUT', cookie: admin, body: { doc: { content: { root: { type: 'root', children: [{ type: 'evil' }] } } } } });
ok('內文區塊類型錯 → 400', badDesign.status === 400);

// 3. 線上仍 404；預覽 token
const pub0 = await j(`/api/sales/autumn-${RUN}`);
ok('未發佈：公開 404', pub0.status === 404);
const tok = await j(`/api/admin/sales/${id}/preview-token`, { method: 'POST', cookie: admin });
const pv = await j(`/api/sales/preview/${id}?token=${encodeURIComponent(tok.body.token)}`);
ok('預覽 API：state preview、內文 HTML、掛載商品 2、通知文字', pv.status === 200 && pv.body.state === 'preview' && pv.body.contentHtml.includes('sk-addtocart') && pv.body.items.length === 2 && pv.body.doc.notice.text === '滿千免運' && !('access' in pv.body.doc));
ok('竄改 token → 401', (await j(`/api/sales/preview/${id}?token=1.x`)).status === 401);
const pvWeb = await fetch(`${W}/preview/sales/${id}?token=${encodeURIComponent(tok.body.token)}`).then(async (r) => ({ status: r.status, text: await r.text() })).catch(() => ({ status: 0, text: '' }));
ok('前台預覽頁：橫幅＋通知＋產品區塊標題', pvWeb.status === 200 && pvWeb.text.includes('沙盒預覽') && pvWeb.text.includes('滿千免運') && pvWeb.text.includes('優惠折扣'), String(pvWeb.status));

// 4. 發佈：需 confirm；lint error 阻擋（倒數無時間）；成功 v1
ok('未 confirm → 400', (await j(`/api/admin/sales/${id}/publish`, { method: 'POST', cookie: admin, body: {} })).status === 400);
await j(`/api/admin/sales/${id}/draft`, { method: 'PUT', cookie: admin, body: { doc: { countdown: { enabled: true, endsAt: '' } } } });
const lintBlock = await j(`/api/admin/sales/${id}/publish`, { method: 'POST', cookie: admin, body: { confirm: true } });
ok('lint error（倒數無結束時間）阻擋', lintBlock.status === 400 && String(lintBlock.body.message).includes('倒數'));
await j(`/api/admin/sales/${id}/draft`, { method: 'PUT', cookie: admin, body: { doc: { countdown: { enabled: false } } } });
const p1 = await j(`/api/admin/sales/${id}/publish`, { method: 'POST', cookie: admin, body: { confirm: true, note: '首發' } });
ok('首次發佈 v1、無備份', p1.status === 201 && p1.body.version === 1 && p1.body.backedUpVersion === null && p1.body.url === `/s/autumn-${RUN}`);
const pub1 = await j(`/api/sales/autumn-${RUN}`);
ok('公開快照：open、商品 2、內文', pub1.status === 200 && pub1.body.state === 'open' && pub1.body.items.length === 2 && pub1.body.contentHtml.includes(`秋季限定 ${RUN}`) && pub1.body.code === 'AU');
// dev 模式首次編譯 /s/[slug] 可能回 500，重試三次
let web1 = { status: 0, text: '' };
for (let i = 0; i < 3 && web1.status !== 200; i++) {
  if (i) await new Promise((r) => setTimeout(r, 1000));
  web1 = await fetch(`${W}/s/autumn-${RUN}`).then(async (r) => ({ status: r.status, text: await r.text() })).catch(() => ({ status: 0, text: '' }));
}
ok('前台 /s 頁：標題／優惠區塊／選購按鈕／客服', web1.status === 200 && web1.text.includes(`秋季限定 ${RUN}`) && web1.text.includes('優惠折扣') && web1.text.includes('選購') && web1.text.includes('LINE'), String(web1.status));

// 5. 改草稿不動線上；二次發佈備份 v1；還原
await j(`/api/admin/sales/${id}/draft`, { method: 'PUT', cookie: admin, body: { doc: { notice: { text: '第二版通知' } } } });
ok('改草稿後線上仍第一版', (await j(`/api/sales/autumn-${RUN}`)).body.doc.notice.text === '滿千免運');
const p2 = await j(`/api/admin/sales/${id}/publish`, { method: 'POST', cookie: admin, body: { confirm: true } });
ok('二次發佈 v2、備份 v1', p2.body.version === 2 && p2.body.backedUpVersion === 1);
const revs = await j(`/api/admin/sales/${id}/revisions`, { cookie: admin });
ok('版本列表含 v1', revs.body.revisions.map((r) => r.version).join(',') === '1');
const rs = await j(`/api/admin/sales/${id}/revisions/1/restore`, { method: 'POST', cookie: admin });
ok('還原 v1 到草稿（線上仍 v2）', rs.status === 201 && rs.body.doc.notice.text === '滿千免運' && (await j(`/api/sales/autumn-${RUN}`)).body.doc.notice.text === '第二版通知');

// 6. 排程關閉／密碼／下架
await j(`/api/admin/sales/${id}/draft`, { method: 'PUT', cookie: admin, body: { doc: { schedule: { closeAt: new Date(Date.now() - 1000).toISOString(), closedMessage: '已結束' } } } });
await j(`/api/admin/sales/${id}/publish`, { method: 'POST', cookie: admin, body: { confirm: true } });
const closed = await j(`/api/sales/autumn-${RUN}`);
ok('關閉時間已過 → state closed＋訊息', closed.body.state === 'closed' && closed.body.closedMessage === '已結束' && !closed.body.items);
await j(`/api/admin/sales/${id}/draft`, { method: 'PUT', cookie: admin, body: { doc: { schedule: { closeAt: '' }, access: { passwordEnabled: true, password: 'open123' } } } });
await j(`/api/admin/sales/${id}/publish`, { method: 'POST', cookie: admin, body: { confirm: true } });
ok('密碼保護：無密碼 locked', (await j(`/api/sales/autumn-${RUN}`)).body.state === 'locked');
ok('密碼錯 locked', (await j(`/api/sales/autumn-${RUN}?pw=wrong`)).body.state === 'locked');
ok('密碼對 open', (await j(`/api/sales/autumn-${RUN}?pw=open123`)).body.state === 'open');
const webLocked = await fetch(`${W}/s/autumn-${RUN}`).then(async (r) => ({ status: r.status, text: await r.text() })).catch(() => ({ status: 0, text: '' }));
ok('前台密碼閘', webLocked.status === 200 && webLocked.text.includes('需要密碼'));
await j(`/api/admin/sales/${id}/unpublish`, { method: 'POST', cookie: admin });
ok('下架後公開 404', (await j(`/api/sales/autumn-${RUN}?pw=open123`)).status === 404);

// 7. OPS／指令台：只存草稿、需 confirm
const up = await act('upsert_sales_page', { slug: `ops-sale-${RUN}`, title: 'OPS 銷售頁', code: 'OP', doc: { items: [{ productId: mug.id, kind: 'product', order: 0 }], content: design } });
ok('OPS upsert_sales_page → 草稿', up.body.ok && up.body.data.created === true && up.body.data.savedAs === 'draft' && up.body.data.items === 1 && up.body.data.preview.includes('/preview/sales/'), JSON.stringify(up.body).slice(0, 200));
ok('OPS 建立後線上 404', (await j(`/api/sales/ops-sale-${RUN}`)).status === 404);
const pubNo = await act('publish_sales_page', { idOrSlug: `ops-sale-${RUN}` });
ok('OPS publish 未 confirm → 拒絕', !pubNo.body.ok && String(pubNo.body.error).includes('confirm'));
const pubYes = await act('publish_sales_page', { idOrSlug: `ops-sale-${RUN}`, confirm: true });
ok('OPS publish confirm → v1', pubYes.body.ok && pubYes.body.data.version === 1);
const lst = await act('list_sales_pages', {});
ok('OPS list_sales_pages 含兩頁', lst.body.ok && lst.body.data.filter((r) => r.slug.endsWith(RUN)).length === 2);
const get = await act('get_sales_page', { idOrSlug: `ops-sale-${RUN}` });
ok('OPS get_sales_page', get.body.ok && get.body.data.doc.items.length === 1);
const cmd = await j('/api/admin/ai/command', { method: 'POST', cookie: admin, body: { message: '幫我建立一個一頁式銷售頁' } });
ok('指令台（mock）對銷售頁需求不炸', cmd.status === 201);
const un = await act('publish_sales_page', { idOrSlug: `ops-sale-${RUN}`, unpublish: true });
ok('OPS 下架', un.body.ok && un.body.data.status === 'draft');

// 清理
await j(`/api/admin/sales/${id}`, { method: 'DELETE', cookie: admin });
await j(`/api/admin/sales/ops-sale-${RUN}`, { method: 'DELETE', cookie: admin });
ok('刪除（cascade 版本）', (await j(`/api/admin/sales/${id}`, { cookie: admin })).status === 404);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

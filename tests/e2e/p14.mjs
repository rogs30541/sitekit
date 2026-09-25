// P14 本機端到端：AI 指令台（mock 規則供應商）——唯讀即時執行／寫入待確認＋token／確認執行／系統功能拒絕；新 OPS：商品分類上架、訂單查詢、課程上架、產圖
const B = process.env.API ?? 'http://localhost:4000';
const RUN = Date.now().toString(36).slice(-4).toLowerCase();
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const W = process.env.E2E_PLATFORM === 'workers';
const okw = (n, c, x = '') => (W ? console.log(`SKIP ${n}（Workers：無伺服器硬碟／外掛／排程）`) : ok(n, c, x));

const j = async (path, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
const cmd = (message, history = []) => j('/api/admin/ai/command', { method: 'POST', cookie: admin, body: { message, history } });
ok('admin login', !!admin);

await act('update_settings', { settings: { 'ai.commandProvider': 'mock', 'ai.provider': 'mock' } });
const cfg = await j('/api/admin/ai/command/config', { cookie: admin });
ok('指令台設定：mock、ready、七大工作項目、動作清單排除系統功能', cfg.status === 200 && cfg.body.provider === 'mock' && cfg.body.ready && cfg.body.tasks.length >= 8 && !cfg.body.actions.some((a) => ['deploy', 'migrate', 'update_settings', 'create_admin', 'delete_admin'].includes(a.action)) && cfg.body.actions.some((a) => a.action === 'upsert_product'), JSON.stringify({ n: cfg.body.actions?.length, tasks: cfg.body.tasks?.length }));

// 1. 上架商品 → 待確認（尚未寫入）→ 確認 → 存在＋分類
const sku = `AI-TEE-${RUN.toUpperCase()}`;
const c1 = await cmd(`上架商品：SKU ${sku}、名稱「AI 創客 T 恤 ${RUN}」、價格 590、分類 服飾${RUN}、庫存 50`);
ok('寫入動作列為待確認並附 token', c1.status === 201 && c1.body.pending?.length === 1 && c1.body.pending[0].action === 'upsert_product' && c1.body.pending[0].params.sku === sku && c1.body.pending[0].params.category === `服飾${RUN}` && !!c1.body.token, JSON.stringify(c1.body).slice(0, 200));
const before = await act('list_products', { q: sku });
ok('確認前商品不存在', before.body.ok && before.body.data.length === 0);
const bad = await j('/api/admin/ai/command/confirm', { method: 'POST', cookie: admin, body: { token: c1.body.token.slice(0, -3) + 'abc' } });
ok('竄改 token → 400', bad.status === 400);
const conf = await j('/api/admin/ai/command/confirm', { method: 'POST', cookie: admin, body: { token: c1.body.token } });
ok('確認執行 → upsert_product 成功', conf.status === 201 && conf.body.results[0].ok && conf.body.results[0].data.created === true && conf.body.results[0].data.category === `服飾${RUN}`, JSON.stringify(conf.body).slice(0, 200));
const after = await act('list_products', { category: `服飾${RUN}` });
ok('list_products 依分類篩到新商品（庫存 50）', after.body.data.length === 1 && after.body.data[0].stock === 50 && after.body.data[0].price === 590);
const pub = await j(`/api/catalog/products?category=${encodeURIComponent(`服飾${RUN}`)}`);
ok('前台商品 API 可依分類篩選', pub.status === 200 && pub.body.length === 1 && pub.body[0].category === `服飾${RUN}`);

// 2. 唯讀立即執行
const c2 = await cmd(`列出分類是服飾${RUN}的商品`);
ok('唯讀動作即時執行（executed 含 list_products 結果）', c2.body.executed?.length === 1 && c2.body.executed[0].action === 'list_products' && c2.body.executed[0].ok && c2.body.executed[0].data.length === 1 && !c2.body.pending?.length);

// 3. 下架分類 → 待確認多步 → 確認
const c3 = await cmd(`把分類是服飾${RUN}的商品下架`);
ok('多步寫入：先查（executed）再列待確認', c3.body.executed?.[0]?.action === 'list_products' && c3.body.pending?.length === 1 && c3.body.pending[0].params.isActive === false);
const conf3 = await j('/api/admin/ai/command/confirm', { method: 'POST', cookie: admin, body: { token: c3.body.token } });
const afterOff = await act('list_products', { sku, q: sku });
ok('確認後商品下架', conf3.body.results[0].ok && afterOff.body.data[0].isActive === false);
const reuse = await j('/api/admin/ai/command/confirm', { method: 'POST', cookie: admin, body: { token: c3.body.token } });
ok('token 可重放但動作冪等（再下架仍 ok）', reuse.status === 201);

// 4. 產圖（mock 供應商佔位圖）→ 待確認 → 確認 → url 可讀
const c4 = await cmd(`幫我做一張秋季課程優惠的 Banner，1536x1024，暖色系`);
ok('Banner 需求 → generate_image 待確認（1536x1024, banner）', c4.body.pending?.[0]?.action === 'generate_image' && c4.body.pending[0].params.size === '1536x1024' && c4.body.pending[0].params.purpose === 'banner');
const conf4 = await j('/api/admin/ai/command/confirm', { method: 'POST', cookie: admin, body: { token: c4.body.token } });
const imgUrl = conf4.body.results?.[0]?.data?.url;
okw('產圖完成回 url（mock svg）', conf4.body.results?.[0]?.ok && typeof imgUrl === 'string' && imgUrl.endsWith('.svg'), JSON.stringify(conf4.body).slice(0, 200));
if (!W) {
  const img = await fetch(imgUrl.replace('http://localhost:3000', B)).catch(() => ({ status: 0 }));
  ok('圖片可下載', img.status === 200, String(img.status));
} else console.log('SKIP 圖片可下載（Workers）');

// 5. 建立課程（含章節）→ 確認
const cslug = `ai-basics-${RUN}`;
const c5 = await cmd(`建立課程 slug ${cslug}「AI 入門 ${RUN}」，價格 1990，摘要 零基礎入門，先不發布，章節：認識 AI、提示詞入門、實作練習`);
ok('課程＋三章節列為待確認', c5.body.pending?.length === 4 && c5.body.pending[0].action === 'upsert_course' && c5.body.pending[0].params.isPublished === false && c5.body.pending[3].action === 'add_chapter');
const conf5 = await j('/api/admin/ai/command/confirm', { method: 'POST', cookie: admin, body: { token: c5.body.token } });
ok('確認後課程建立且未發布、章節 3', conf5.body.results.length === 4 && conf5.body.results.every((r) => r.ok) && conf5.body.results[0].data.created === true, JSON.stringify(conf5.body.results.map((r) => r.ok)));
const courses = await act('list_courses', {});
const course = courses.body.data.find((c) => c.slug === cslug);
ok('list_courses 看到新課程（章節數 3、未發布）', course && course.isPublished === false && course.chapters === 3, JSON.stringify(course));
const pubCourse = await j(`/api/catalog/courses/${cslug}`);
ok('未發布課程前台 404', pubCourse.status === 404);

// 6. 建頁面 → 待確認 upsert_content（草稿）→ 確認 → 線上 404、預覽可用
const c6 = await cmd(`幫我建立 slug about-${RUN} 的「關於我們 ${RUN}」頁面草稿`);
ok('頁面需求 → upsert_content 待確認', c6.body.pending?.[0]?.action === 'upsert_content' && c6.body.pending[0].params.slug === `about-${RUN}`);
const conf6 = await j('/api/admin/ai/command/confirm', { method: 'POST', cookie: admin, body: { token: c6.body.token } });
ok('確認後存草稿（savedAs draft、回預覽連結）', conf6.body.results[0].ok && conf6.body.results[0].data.savedAs === 'draft' && String(conf6.body.results[0].data.preview).includes('/preview/') && conf6.body.summary.includes('/preview/'));
const live = await j(`/api/content/pages/about-${RUN}`);
ok('頁面未上線（需另行確認發佈）', live.status === 404);

// 7. 訂單／報表唯讀；系統功能拒絕；history 帶入
const c7 = await cmd('列出今天已付款的訂單');
ok('訂單查詢即時執行', c7.body.executed?.[0]?.action === 'list_orders' && c7.body.executed[0].ok && c7.body.executed[0].params.status === 'paid');
const c8 = await cmd('看一下這個月的銷售報表');
ok('報表即時執行', c8.body.executed?.[0]?.action === 'sales_report' && c8.body.executed[0].ok);
const c9 = await cmd('幫我部署到正式環境');
ok('系統功能拒絕', c9.body.reply.includes('不開放') && !c9.body.pending?.length && !c9.body.executed?.length);
const c10 = await cmd('謝謝', [{ role: 'user', text: '列出商品' }, { role: 'assistant', text: '已列出' }]);
ok('帶 history 不炸', c10.status === 201);
const direct = await act('get_order', { orderNo: 'NOPE' });
ok('get_order 不存在 → error', !direct.body.ok);
const chap = await act('add_chapter', { courseSlug: cslug, title: '加碼章節', isPreview: true });
ok('OPS add_chapter 直接呼叫', chap.body.ok && chap.body.data.order === 3);

// 清理
const prod = await act('list_products', { q: sku });
if (prod.body.data?.[0]) await j(`/api/admin/catalog/products/${prod.body.data[0].id}`, { method: 'PATCH', cookie: admin, body: { isActive: false } });
await j(`/api/admin/content/about-${RUN}`, { method: 'DELETE', cookie: admin });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

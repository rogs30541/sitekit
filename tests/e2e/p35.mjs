// P35：一頁式網頁套版——list_sales_templates 25 套（五分類 × 5 風格）；apply_sales_template 需 confirm、建立草稿（content／theme／sections／notice）不發佈；
//      套到既有 slug 覆寫內文；沙盒預覽含內文；mock 指令台「用模板建立銷售頁」→ 待確認；MCP 名單；iconbox 圖示名稱渲染成 SVG
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const B = process.env.API ?? 'http://localhost:4000';
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const RUN = Date.now().toString(36);
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
ok('admin login', !!admin);
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
const cmd = (message, history = []) => j('/api/admin/ai/command', { method: 'POST', cookie: admin, body: { message, history } });
await act('update_settings', { settings: { 'ai.commandProvider': 'mock' } });

// 1) 名單
const list = await act('list_sales_templates');
const tpls = list.body?.data?.templates ?? [];
ok('list_sales_templates 回 25 套', list.body?.ok === true && tpls.length === 25, String(tpls.length));
const byCat = tpls.reduce((m, t) => ((m[t.category] = (m[t.category] ?? 0) + 1), m), {});
ok('五分類各 5 套', ['image', 'shop', 'course', 'brand', 'service'].every((c) => byCat[c] === 5), JSON.stringify(byCat));
ok('每套含 palette／blocks／style，id 唯一', tpls.every((t) => t.palette?.primary && Array.isArray(t.blocks) && t.blocks.length >= 8 && t.style) && new Set(tpls.map((t) => t.id)).size === 25);
ok('課程類含 airuru 骨架版「霓虹爆款」且標記來源', tpls.some((t) => t.id === 'sales-course-neon' && t.category === 'course' && t.style === '霓虹爆款' && /airuru/.test(t.source ?? '')));
ok('每分類風格名各不同', ['image', 'shop', 'course', 'brand', 'service'].every((c) => new Set(tpls.filter((t) => t.category === c).map((t) => t.style)).size === 5));
const onlyShop = await act('list_sales_templates', { category: 'shop' });
ok('category=shop 過濾 5', (onlyShop.body?.data?.templates ?? []).length === 5);

// 2) 保護
const noConfirm = await act('apply_sales_template', { id: 'sales-course-neon', title: 'x' });
ok('apply 無 confirm 被拒', noConfirm.body?.ok === false);
const badId = await act('apply_sales_template', { id: 'sales-nope', title: 'x', confirm: true });
ok('apply 未知 id 被拒', badId.body?.ok === false);

// 3) 建立新頁
const slug = `p35-${RUN}`;
const ap = await act('apply_sales_template', { id: 'sales-course-neon', slug, title: `P35 課程頁 ${RUN}`, confirm: true });
const d = ap.body?.data;
ok('apply 建立草稿：created、slug、template、blocks、preview、url', ap.body?.ok === true && d.created === true && d.slug === slug && d.template.id === 'sales-course-neon' && Array.isArray(d.blocks) && d.preview?.url && d.url === `/s/${slug}`, JSON.stringify(ap.body).slice(0, 200));
const page = await j(`/api/admin/sales/${d.id}`, { cookie: admin });
const doc = page.body?.draft ?? page.body?.page?.draft ?? page.body?.doc;
ok('草稿 content 有區塊（DesignDoc root.children ≥ 8）', page.status === 200 && Array.isArray(doc?.content?.root?.children) && doc.content.root.children.length >= 8, JSON.stringify(Object.keys(page.body ?? {})).slice(0, 120));
ok('草稿 theme.primaryColor＝配色主色、通知列啟用、sections 標題「選擇場次」', doc?.theme?.primaryColor === tpls.find((t) => t.id === 'sales-course-neon').palette.primary && doc?.notice?.enabled === true && doc?.sections?.titles?.offer === '選擇場次', JSON.stringify({ t: doc?.theme?.primaryColor, n: doc?.notice, s: doc?.sections?.titles }).slice(0, 200));
ok('內文含 addtocart 與 iconbox（圖示名稱）', JSON.stringify(doc?.content).includes('"addtocart"') && /"icon":"(zap|meh|frown|clock|search|mic|pen)"/.test(JSON.stringify(doc?.content)));
ok('狀態為草稿（未發佈）', (page.body?.page?.status ?? page.body?.status) === 'draft');
const pub = await j(`/api/sales/${slug}`);
ok('公開端未發佈 → 404', pub.status === 404);

// 4) 沙盒預覽含內文 HTML 與 SVG 圖示
const m = String(d.preview.url).match(/\/preview\/sales\/([^?]+)\?token=([^&]+)/);
const prev = m ? await j(`/api/sales/preview/${m[1]}?token=${m[2]}`) : { status: 0, body: null };
const html = JSON.stringify(prev.body ?? '');
ok('預覽 API 200 且內文 HTML 含 sk-iconbox 與 <svg（圖示名稱→SVG）', prev.status === 200 && html.includes('sk-iconbox') && html.includes('<svg'), String(prev.status));

// 5) 套到既有 slug：覆寫內文與主題、保留標題
const ap2 = await act('apply_sales_template', { id: 'sales-shop-gold', slug, confirm: true });
ok('套第二套到同 slug：created=false、template 換成 shop-gold', ap2.body?.ok === true && ap2.body.data.created === false && ap2.body.data.template.id === 'sales-shop-gold');
const page2 = await j(`/api/admin/sales/${d.id}`, { cookie: admin });
const doc2 = page2.body?.draft ?? page2.body?.page?.draft ?? page2.body?.doc;
ok('內文與主色已換、標題保留', doc2?.theme?.primaryColor === tpls.find((t) => t.id === 'sales-shop-gold').palette.primary && (page2.body?.page?.title ?? page2.body?.title) === `P35 課程頁 ${RUN}`);

// 6) mock 指令台
const r1 = await cmd('有哪些銷售頁模板？');
ok('mock：列模板（唯讀）', r1.status < 300 && (r1.body.executed ?? []).some((e) => e.action === 'list_sales_templates' && e.ok));
const r2 = await cmd(`用模板 sales-service-navy 建立銷售頁「P35 服務頁 ${RUN}」`);
ok('mock：用模板建立 → apply_sales_template 待確認', (r2.body?.pending ?? []).some((p) => p.action === 'apply_sales_template' && p.params.id === 'sales-service-navy' && p.params.confirm === true && p.params.title === `P35 服務頁 ${RUN}`), JSON.stringify(r2.body?.pending).slice(0, 200));

// 收尾
await fetch(`${B}/api/admin/sales/${d.id}`, { method: 'DELETE', headers: { cookie: admin } });

// 7) MCP
const mcp = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'mcp', 'server.mjs'), 'utf8');
ok('mcp/server.mjs 含 sitekit_list_sales_templates／sitekit_apply_sales_template', mcp.includes("'sitekit_list_sales_templates'") && mcp.includes("'sitekit_apply_sales_template'"));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

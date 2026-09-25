// P34：一鍵建站——recommend_site_template（行業→分類、備選）；quick_setup_site（confirm 保護、套版＋品牌資料寫進 hero／聯絡區塊＋品牌設定＋主題）；
//      mock 指令台「幫我建站」→ recommend 即時＋quick_setup_site 待確認→確認執行；還原；MCP 名單
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
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
ok('admin login', !!admin);
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
const cmd = (message, history = []) => j('/api/admin/ai/command', { method: 'POST', cookie: admin, body: { message, history } });
await act('update_settings', { settings: { 'ai.commandProvider': 'mock' } });
const pre = await act('list_site_templates');
if (pre.body?.data?.current?.id && pre.body?.data?.current?.hasBackup) await act('apply_site_template', { id: pre.body.data.current.id, confirm: true, restore: true });
const site0 = await j('/api/content/site');

// 1) 推薦
const r1 = await act('recommend_site_template', { industry: '手工烘焙坊', style: '溫暖' });
ok('烘焙 → shop 分類且有推薦與備選', r1.body?.ok === true && r1.body.data.category === 'shop' && !!r1.body.data.picked && r1.body.data.alternatives.length === 3, JSON.stringify(r1.body?.data).slice(0, 160));
const r2 = await act('recommend_site_template', { industry: '線上英文課程' });
ok('課程 → course 分類', r2.body?.data?.category === 'course' && r2.body.data.picked?.category === 'course');
const r3 = await act('recommend_site_template', { category: 'service', keywords: ['律師', '事務所'] });
ok('指定 category=service 並以關鍵字計分', r3.body?.data?.category === 'service' && r3.body.data.picked?.category === 'service' && r3.body.data.picked.score >= 1, JSON.stringify(r3.body?.data?.picked).slice(0, 120));
const r4 = await act('recommend_site_template', { industry: '完全不明的東西' });
ok('無法判斷行業 → category undefined 但仍從全部推薦', r4.body?.ok === true && !r4.body.data.category && !!r4.body.data.picked);

// 2) 保護
const noConfirm = await act('quick_setup_site', { templateId: r1.body.data.picked.id, brandName: 'X' });
ok('quick_setup_site 無 confirm 被拒', noConfirm.body?.ok === false);
const noTpl = await act('quick_setup_site', { confirm: true, industry: '完全不明的東西', category: 'nope' });
ok('無法判斷且無 templateId 仍有推薦（全部）→ 成功或明確錯誤', noTpl.body?.ok === true || /版型/.test(noTpl.body?.error ?? ''));
if (noTpl.body?.ok) await act('apply_site_template', { id: noTpl.body.data.template.id, confirm: true, restore: true });

// 3) 一鍵建站
const q = await act('quick_setup_site', { confirm: true, industry: '手工烘焙坊', style: '溫暖', brandName: 'P34 烘焙坊', tagline: '每天現烤', contactEmail: 'p34@example.com', phone: '02-1234-5678', mode: 'light' });
const d = q.body?.data;
ok('quick_setup_site 成功並回 template／pages／brandUpdated／next', q.body?.ok === true && d.template.category === 'shop' && Array.isArray(d.pages) && d.brandUpdated.includes('brand.name') && d.brandUpdated.includes('brand.contactEmail') && Array.isArray(d.next) && d.next.length > 0, JSON.stringify(q.body).slice(0, 200));
const site = await j('/api/content/site');
ok('品牌設定：name／siteName／tagline／contactEmail／phone', site.body?.brand?.name === 'P34 烘焙坊' && site.body.brand.siteName === 'P34 烘焙坊' && site.body.brand.tagline === '每天現烤' && site.body.brand.contactEmail === 'p34@example.com' && site.body.brand.phone === '02-1234-5678', JSON.stringify(site.body?.brand).slice(0, 200));
const hero = (site.body?.home?.sections ?? []).find((s) => s.kind === 'hero');
ok('首頁 hero：kicker=品牌名、subtitle=標語', hero?.kicker === 'P34 烘焙坊' && hero?.subtitle === '每天現烤', JSON.stringify({ kicker: hero?.kicker, subtitle: hero?.subtitle }));
ok('主題 mode=light（有給才改）', site.body?.theme?.mode === 'light');
const contactPage = await j('/api/content/pages/contact');
const items = (contactPage.body?.sections ?? []).find((s) => s.kind === 'contact')?.items ?? [];
ok('聯絡子頁的 Email／電話已換成填入值', contactPage.status === 200 && items.some((i) => i.value === 'p34@example.com' && i.href === 'mailto:p34@example.com') && items.some((i) => i.value === '02-1234-5678' && i.href === 'tel:0212345678'), JSON.stringify(items).slice(0, 200));
ok('current 版型＝一鍵建站選的', (await act('list_site_templates')).body?.data?.current?.id === d.template.id);

// 4) 還原後再走 mock 指令台
await act('apply_site_template', { id: d.template.id, confirm: true, restore: true });
const m1 = await cmd('幫我建站：品牌「P34 二號店」、行業 烘焙、風格 溫暖、Email two@example.com');
ok('mock：幫我建站 → recommend 即時執行＋quick_setup_site 待確認', (m1.body?.executed ?? []).some((e) => e.action === 'recommend_site_template' && e.ok) && (m1.body?.pending ?? []).some((p) => p.action === 'quick_setup_site' && p.params.confirm === true && p.params.brandName === 'P34 二號店' && p.params.contactEmail === 'two@example.com'), JSON.stringify(m1.body?.pending).slice(0, 200));
const conf = await j('/api/admin/ai/command/confirm', { method: 'POST', cookie: admin, body: { token: m1.body.token } });
ok('確認執行 → quick_setup_site 成功', conf.status < 300 && (conf.body.results ?? []).some((e) => e.action === 'quick_setup_site' && e.ok), JSON.stringify(conf.body).slice(0, 160));
const site2 = await j('/api/content/site');
ok('指令台建站後品牌名生效', site2.body?.brand?.name === 'P34 二號店');
const m2 = await cmd('幫我建站');
ok('mock：資料不足 → 要求品牌與行業', !(m2.body?.pending ?? []).length && /品牌|行業/.test(m2.body?.reply ?? ''));

// 收尾：還原並回復品牌
const cur = (await act('list_site_templates')).body?.data?.current?.id;
if (cur) await act('apply_site_template', { id: cur, confirm: true, restore: true });
await act('update_brand', { settings: { 'brand.name': site0.body?.brand?.name ?? '', 'brand.siteName': site0.body?.brand?.siteName ?? '', 'brand.tagline': site0.body?.brand?.tagline ?? '', 'brand.contactEmail': site0.body?.brand?.contactEmail ?? '', 'brand.phone': site0.body?.brand?.phone ?? '' } });
await act('update_settings', { settings: { 'theme.mode': '' } });
const site3 = await j('/api/content/site');
ok('還原後首頁區塊數回到起點', (site3.body?.home?.sections ?? []).length === (site0.body?.home?.sections ?? []).length, `${(site3.body?.home?.sections ?? []).length} vs ${(site0.body?.home?.sections ?? []).length}`);

// 5) MCP
const mcp = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'mcp', 'server.mjs'), 'utf8');
ok('mcp/server.mjs 含 sitekit_recommend_site_template／sitekit_quick_setup_site', mcp.includes("'sitekit_recommend_site_template'") && mcp.includes("'sitekit_quick_setup_site'"));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

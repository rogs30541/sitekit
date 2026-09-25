// P33：AI 工作站 2.0——指令台設定回五組十一項工作；新 OPS set_theme／update_brand（白名單、生效到 /api/content/site）；
//      mock 指令台：版型→待確認→確認執行；主題／品牌／首頁區塊／表單訊息規則；MCP 名單含兩新工具
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

// 1) 設定：五組十一項
const cfg = await j('/api/admin/ai/command/config', { cookie: admin });
const groups = [...new Set((cfg.body?.tasks ?? []).map((t) => t.group))];
ok('工作項目 12 項、五組（建站／內容／商務／營運／設計）', cfg.status === 200 && cfg.body.tasks.length === 12 && JSON.stringify(groups) === JSON.stringify(['建站', '內容', '商務', '營運', '設計']), JSON.stringify(groups));
ok('每項有 key／label／desc／examples', cfg.body.tasks.every((t) => t.key && t.label && t.desc && Array.isArray(t.examples) && t.examples.length > 0));
const actions = cfg.body.actions.map((a) => a.action);
ok('動作清單含 set_theme／update_brand／apply_site_template／list_contact_messages，排除 update_settings', ['set_theme', 'update_brand', 'apply_site_template', 'list_contact_messages', 'set_home_sections'].every((a) => actions.includes(a)) && !actions.includes('update_settings'));

// 2) set_theme：白名單＋生效
const before = await j('/api/content/site');
const th = await act('set_theme', { mode: 'dark', font: 'rounded', radius: 'xl', accent: '#22aa66', bogus: 'x' });
ok('set_theme 只寫給的鍵並回 updated', th.body?.ok === true && th.body.data.updated['theme.mode'] === 'dark' && th.body.data.updated['theme.font'] === 'rounded' && th.body.data.updated['brand.primaryColor'] === '#22aa66' && !('bogus' in th.body.data.updated), JSON.stringify(th.body).slice(0, 200));
const badTheme = await act('set_theme', { mode: 'neon' });
ok('set_theme 非法值被拒', badTheme.body?.ok === false);
const site = await j('/api/content/site');
ok('/api/content/site.theme 反映 dark／rounded／xl／accent', site.body?.theme?.mode === 'dark' && site.body.theme.font === 'rounded' && site.body.theme.radius === 'xl' && site.body.theme.accent === '#22aa66', JSON.stringify(site.body?.theme));

// 3) update_brand：白名單
const ub = await act('update_brand', { settings: { 'brand.siteName': 'P33 測試站', 'brand.contactEmail': 'p33@example.com', 'payment.provider': 'hack', 'anthropic.apiKey': 'hack', 'brand.secretKey': 'hack' } });
ok('update_brand 只更新 brand.*（拒絕金流／金鑰／含 key 的鍵）', ub.body?.ok === true && ub.body.data.updated['brand.siteName'] === 'P33 測試站' && !('payment.provider' in ub.body.data.updated) && !('anthropic.apiKey' in ub.body.data.updated) && !('brand.secretKey' in ub.body.data.updated), JSON.stringify(ub.body).slice(0, 200));
const site2 = await j('/api/content/site');
ok('site.brand 反映新名稱與 Email', site2.body?.brand?.siteName === 'P33 測試站' && site2.body.brand.contactEmail === 'p33@example.com');
const emptyBrand = await act('update_brand', { settings: { 'payment.provider': 'x' } });
ok('update_brand 全是非白名單鍵 → 失敗', emptyBrand.body?.ok === false);

// 4) mock 指令台：版型
const pre = await act('list_site_templates');
if (pre.body?.data?.current?.id && pre.body?.data?.current?.hasBackup) await act('apply_site_template', { id: pre.body.data.current.id, confirm: true, restore: true });
const r1 = await cmd('有哪些電商版型？');
ok('mock：列版型（唯讀即時執行 list_site_templates）', r1.status < 300 && r1.body.executed?.some((e) => e.action === 'list_site_templates' && e.ok) && !r1.body.pending?.length, JSON.stringify(r1.body).slice(0, 160));
const r2 = await cmd('套用 shop-fashion-clean');
const pend = r2.body?.pending ?? [];
const pickedId = pend[0]?.params?.id;
ok('mock：「套用 <id>」→ apply_site_template 進待確認（不立即執行）', pend.length === 1 && pend[0].action === 'apply_site_template' && !!r2.body.token, JSON.stringify(pend).slice(0, 160));
const cur0 = (await act('list_site_templates')).body?.data?.current?.id ?? '';
ok('確認前 current 未變', cur0 !== pickedId);
const conf = await j('/api/admin/ai/command/confirm', { method: 'POST', cookie: admin, body: { token: r2.body.token } });
ok('確認執行 → apply 成功', conf.status < 300 && (conf.body.results ?? []).some((e) => e.action === 'apply_site_template' && e.ok), JSON.stringify(conf.body).slice(0, 160));
const cur1 = (await act('list_site_templates')).body?.data?.current?.id ?? '';
ok('確認後 current＝套用的版型', !!pickedId && cur1 === pickedId, `${cur1} vs ${pickedId}`);

// 5) mock：主題／品牌／首頁區塊／表單訊息
const r3 = await cmd('整站換成深色、圓體字');
ok('mock：主題 → set_theme 待確認（mode=dark,font=rounded）', (r3.body?.pending ?? []).some((p) => p.action === 'set_theme' && p.params.mode === 'dark' && p.params.font === 'rounded'));
const r4 = await cmd('網站名稱改成「P33 二號站」，Email 改成 two@example.com');
ok('mock：品牌 → update_brand 待確認', (r4.body?.pending ?? []).some((p) => p.action === 'update_brand' && p.params.settings?.['brand.siteName'] === 'P33 二號站' && p.params.settings?.['brand.contactEmail'] === 'two@example.com'), JSON.stringify(r4.body?.pending).slice(0, 160));
const r5 = await cmd('首頁加一段學員見證');
const n0 = ((await act('get_site')).body?.data?.home?.sections ?? []).length;
ok('mock：首頁區塊 → 先 get_site 再 set_home_sections 待確認（區塊 +1）', (r5.body?.executed ?? []).some((e) => e.action === 'get_site') && (r5.body?.pending ?? []).some((p) => p.action === 'set_home_sections' && p.params.sections.length === n0 + 1 && p.params.sections.at(-1).kind === 'testimonials'));
const r6 = await cmd('未讀的表單訊息有哪些');
ok('mock：表單訊息 → list_contact_messages 即時執行', (r6.body?.executed ?? []).some((e) => e.action === 'list_contact_messages' && e.ok));
const r7 = await cmd('幫我改金流設定');
ok('mock：系統功能拒絕', /系統功能/.test(r7.body?.reply ?? ''));

// 收尾：還原
await act('apply_site_template', { id: cur1, confirm: true, restore: true });
await act('update_brand', { settings: { 'brand.siteName': before.body?.brand?.siteName ?? '', 'brand.contactEmail': before.body?.brand?.contactEmail ?? '' } });
await act('update_settings', { settings: { 'brand.primaryColor': '', 'theme.mode': '', 'theme.font': '', 'theme.radius': '' } });

// 6) MCP
const mcp = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'mcp', 'server.mjs'), 'utf8');
ok('mcp/server.mjs 含 sitekit_set_theme／sitekit_update_brand', mcp.includes("'sitekit_set_theme'") && mcp.includes("'sitekit_update_brand'"));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

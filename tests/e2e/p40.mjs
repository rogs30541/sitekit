// P40：主管理員 Email（第一個輸入的 Email 為主）＋可重設／救援——
//      admin.primaryEmail 永久具註冊資格（register/request sent:true＋範本 admin_register）、已是管理員回清楚訊息；
//      本人換 Email（PATCH /api/admin/auth/me，要目前密碼；主管理員 Email／mail.adminTo 跟著改）；superadmin 改他人 Email（PATCH users／OPS update_admin）；
//      忘記密碼 forgot→reset（範本 admin_password_reset、舊 session 失效）；CLI `sitekit admin set-email|reset-password` 救援（不需登入不需收信）；
//      信件範本 13 種；MCP update_admin 含 email
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const B = process.env.API ?? 'http://localhost:4000';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const RUN = Date.now().toString(36);
const login = async (email, password) => j('/api/admin/auth/login', { method: 'POST', body: { email, password } });
const admin = (await login('admin@example.com', 'admin12345')).cookie;
ok('admin login', !!admin);
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
const settings = async () => (await act('get_settings')).body?.data ?? {};
const before = await settings();
const prevPrimary = before['admin.primaryEmail'] ?? '';
const prevAdminTo = before['mail.adminTo'] ?? '';
await act('update_settings', { settings: { 'admin.registerAllowlist': '', 'mail.adminTo': '' } });

// 1) 主管理員 Email 永久可註冊
const primary = `primary-${RUN}@example.com`;
await act('update_settings', { settings: { 'admin.primaryEmail': primary } });
const r0 = await j('/api/admin/auth/register/request', { method: 'POST', body: { email: `stranger-${RUN}@example.com` } });
ok('非主管理員／非白名單 Email → sent:false（不寄）', r0.status < 300 && r0.body.sent === false);
const r1 = await j('/api/admin/auth/register/request', { method: 'POST', body: { email: primary } });
ok('主管理員 Email → sent:true、走範本 admin_register、非 production 回 devCode', r1.status < 300 && r1.body.sent === true && /^\d{6}$/.test(r1.body.devCode ?? '') && r1.body.mail?.provider === 'log', JSON.stringify(r1.body));
const rec = (await act('storage_status')).body?.data?.recent ?? [];
ok('通知紀錄 kind=admin_register 寄給主管理員 Email', rec.some((x) => x.kind === 'admin_register' && x.to === primary));
const c1 = await j('/api/admin/auth/register/confirm', { method: 'POST', body: { email: primary, code: r1.body.devCode, password: 'primary-pass-123', displayName: 'Primary' } });
ok('主管理員 Email 完成註冊並登入（role admin，因站台已有 superadmin）', c1.status < 300 && c1.body.admin?.email === primary && c1.body.admin.role === 'admin' && !!c1.cookie, JSON.stringify(c1.body).slice(0, 120));
const primaryCookie = c1.cookie;
const dup = await j('/api/admin/auth/register/request', { method: 'POST', body: { email: primary } });
ok('已是管理員再註冊 → 409 清楚訊息（請登入／忘記密碼）', dup.status === 409 && /登入|忘記密碼/.test(JSON.stringify(dup.body)));

// 2) 本人換 Email（要目前密碼）；主管理員 Email／mail.adminTo 跟著改
await act('update_settings', { settings: { 'mail.adminTo': primary } });
const wrongPw = await j('/api/admin/auth/me', { method: 'PATCH', cookie: primaryCookie, body: { email: `fixed-${RUN}@example.com`, currentPassword: 'nope-nope-1' } });
ok('目前密碼錯 → 401', wrongPw.status === 401);
const fixed = `fixed-${RUN}@example.com`;
const me1 = await j('/api/admin/auth/me', { method: 'PATCH', cookie: primaryCookie, body: { email: fixed, currentPassword: 'primary-pass-123' } });
ok('PATCH me 換 Email 成功、回新 primaryEmail', me1.status < 300 && me1.body.admin?.email === fixed && me1.body.primaryEmail === fixed, JSON.stringify(me1.body).slice(0, 160));
const s1 = await settings();
ok('admin.primaryEmail 與 mail.adminTo 都跟著改', s1['admin.primaryEmail'] === fixed && s1['mail.adminTo'] === fixed, `${s1['admin.primaryEmail']} / ${s1['mail.adminTo']}`);
ok('舊 Email 登入失敗、新 Email 登入成功', (await login(primary, 'primary-pass-123')).status === 401 && (await login(fixed, 'primary-pass-123')).status < 300);
const taken = await j('/api/admin/auth/me', { method: 'PATCH', cookie: primaryCookie, body: { email: 'admin@example.com', currentPassword: 'primary-pass-123' } });
ok('換成別人的 Email → 409', taken.status === 409);
const prim = await j('/api/admin/auth/primary', { cookie: admin });
ok('GET /api/admin/auth/primary 回主管理員 Email', prim.status === 200 && prim.body.primaryEmail === fixed);

// 3) superadmin 改他人 Email（PATCH users）＋ OPS update_admin email
const fixed2 = `fixed2-${RUN}@example.com`;
const up = await j(`/api/admin/auth/users/${fixed}`, { method: 'PATCH', cookie: admin, body: { email: fixed2 } });
ok('superadmin PATCH users 改 Email（不用密碼）', up.status < 300 && up.body.email === fixed2);
const fixed3 = `fixed3-${RUN}@example.com`;
const ops = await act('update_admin', { idOrEmail: fixed2, email: fixed3, displayName: 'Fixed3' });
ok('OPS update_admin email 生效、主管理員 Email 跟著改', ops.body?.ok === true && ops.body.data.email === fixed3 && (await settings())['admin.primaryEmail'] === fixed3, JSON.stringify(ops.body).slice(0, 120));

// 4) 忘記密碼
const f0 = await j('/api/admin/auth/forgot', { method: 'POST', body: { email: `nobody-${RUN}@example.com` } });
ok('不存在的 Email → sent:false（防列舉）', f0.status < 300 && f0.body.sent === false);
const f1 = await j('/api/admin/auth/forgot', { method: 'POST', body: { email: fixed3 } });
ok('既有管理員 → sent:true＋devCode，範本 admin_password_reset', f1.status < 300 && f1.body.sent === true && /^\d{6}$/.test(f1.body.devCode ?? '') && ((await act('storage_status')).body?.data?.recent ?? []).some((x) => x.kind === 'admin_password_reset' && x.to === fixed3));
const badReset = await j('/api/admin/auth/reset', { method: 'POST', body: { email: fixed3, code: '000000', password: 'new-pass-12345' } });
ok('錯驗證碼 → 400', badReset.status === 400 && f1.body.devCode !== '000000');
const reset = await j('/api/admin/auth/reset', { method: 'POST', body: { email: fixed3, code: f1.body.devCode, password: 'new-pass-12345' } });
ok('重設密碼並登入', reset.status < 300 && !!reset.cookie && reset.body.admin?.email === fixed3);
const oldSession = await j('/api/admin/auth/me', { cookie: primaryCookie });
ok('重設後舊 session 失效', oldSession.body?.authenticated === false);
ok('新密碼可登入、舊密碼不行', (await login(fixed3, 'new-pass-12345')).status < 300 && (await login(fixed3, 'primary-pass-123')).status === 401);

// 5) CLI 救援（不需登入、不需收信）。reset-password 只重設既有帳號（不存在＝報錯，不會改到第一位 superadmin）；
//    set-email 才會把「第一位 superadmin」的 Email 改成給的值——為了不動 seed 的 admin@example.com，這裡用 set-email 給既有 Email 驗證主管理員 Email 與密碼重設
const W = process.env.E2E_PLATFORM === 'workers';
const envFile = join(ROOT, 'apps', 'api', '.env');
const dbUrl = process.env.DATABASE_URL || (existsSync(envFile) ? readFileSync(envFile, 'utf8').match(/^DATABASE_URL=(.*)$/m)?.[1]?.replace(/^["']|["']$/g, '') : '');
const env = { ...process.env, DATABASE_URL: dbUrl };
if (W || !dbUrl) console.log(`SKIP CLI 救援（${W ? 'workers 平台沒有 Node CLI' : '找不到 DATABASE_URL'}）`);
else {
let cliOut = '';
try {
  cliOut = execFileSync(process.execPath, [join(ROOT, 'apps', 'server', 'bin', 'sitekit.mjs'), 'admin', 'reset-password', fixed3, 'cli-pass-12345'], { cwd: ROOT, env, encoding: 'utf8', timeout: 60_000 });
} catch (e) {
  cliOut = String(e.stdout ?? '') + String(e.stderr ?? '') + String(e.message);
}
ok('CLI sitekit admin reset-password 成功', /管理員救援完成：.*password/.test(cliOut), cliOut.slice(-160));
let cliMissing = '';
try {
  cliMissing = execFileSync(process.execPath, [join(ROOT, 'apps', 'server', 'bin', 'sitekit.mjs'), 'admin', 'reset-password', `ghost-${RUN}@example.com`, 'cli-pass-12345'], { cwd: ROOT, env, encoding: 'utf8', timeout: 60_000, stdio: 'pipe' });
} catch (e) {
  cliMissing = String(e.stdout ?? '') + String(e.stderr ?? '') + String(e.message);
}
ok('CLI reset-password 不存在的 Email → 報錯、不改第一位 superadmin', /找不到管理員/.test(cliMissing) && (await login('admin@example.com', 'admin12345')).status < 300, cliMissing.slice(-120));
ok('CLI 重設後可用新密碼登入', (await login(fixed3, 'cli-pass-12345')).status < 300);
// set-email 走 rescue：Email 已存在時只設主管理員 Email＋（給密碼時）重設密碼
let cliOut2 = '';
try {
  cliOut2 = execFileSync(process.execPath, [join(ROOT, 'apps', 'server', 'bin', 'sitekit.mjs'), 'admin', 'set-email', fixed3, '--password', 'cli-pass-67890'], { cwd: ROOT, env, encoding: 'utf8', timeout: 60_000 });
} catch (e) {
  cliOut2 = String(e.stdout ?? '') + String(e.stderr ?? '') + String(e.message);
}
ok('CLI set-email（既有 Email＋密碼）→ 主管理員 Email＝它、密碼重設', /管理員救援完成/.test(cliOut2) && (await settings())['admin.primaryEmail'] === fixed3 && (await login(fixed3, 'cli-pass-67890')).status < 300, cliOut2.slice(-160));

}

// 6) 範本 13 種＋MCP
const tpls = (await act('list_mail_templates')).body?.data ?? [];
ok('信件範本 13 種，含 admin_register／admin_password_reset（收件對象 管理員）', tpls.length === 13 && ['admin_register', 'admin_password_reset'].every((k) => tpls.find((t) => t.kind === k)?.to === '管理員'));
const pv = await act('preview_mail_template', { kind: 'admin_register' });
ok('admin_register 預覽含範例驗證碼', pv.body?.ok === true && /482913/.test(pv.body.data.html));
const mcp = readFileSync(join(ROOT, 'mcp', 'server.mjs'), 'utf8');
ok('mcp sitekit_update_admin 含 email 參數', /sitekit_update_admin[^\n]*email: z\.string\(\)\.email\(\)\.optional\(\)/.test(mcp));

// 收尾：刪測試管理員、還原設定
await act('delete_admin', { idOrEmail: fixed3 });
await act('update_settings', { settings: { 'admin.primaryEmail': prevPrimary, 'mail.adminTo': prevAdminTo, 'admin.registerAllowlist': before['admin.registerAllowlist'] ?? '' } });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

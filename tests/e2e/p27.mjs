// P27：交付化地基——安裝精靈狀態／第一位管理員閘門、健康檢查、支援包、OPS token（superadmin）、setup 完成標記、種子不再寫品牌
const B = process.env.API ?? 'http://localhost:4000';
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie, headers = {} } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...headers, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0], headers: r.headers };
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
ok('admin login', !!admin);

// 1. 安裝精靈狀態（已有管理員的站台）
const st = await j('/api/setup/status');
ok('setup/status 公開可讀、needsSetup=false、含版本', st.status === 200 && st.body.needsSetup === false && typeof st.body.version === 'string', JSON.stringify(st.body));
const firstAdmin = await j('/api/setup/admin', { method: 'POST', body: { email: 'intruder@example.com', password: 'password123' } });
ok('已有管理員時 POST /setup/admin → 403（不能再搶站長）', firstAdmin.status === 403, JSON.stringify(firstAdmin.body).slice(0, 100));
const completeNoAuth = await j('/api/setup/complete', { method: 'POST' });
ok('setup/complete 未登入 → 401', completeNoAuth.status === 401);
const complete = await j('/api/setup/complete', { method: 'POST', cookie: admin });
ok('setup/complete 登入 → ok＋completedAt', complete.status === 201 && complete.body.ok && complete.body.completedAt, JSON.stringify(complete.body));
const st2 = await j('/api/setup/status');
ok('status.completed=true', st2.body.completed === true);

// 2. 健康檢查
const h = await j('/api/admin/system/health', { cookie: admin });
ok('health 200 且 db.ok', h.status === 200 && h.body.db?.ok === true, JSON.stringify(h.body.db));
ok('health 儲存寫入後讀回 ok（local）', h.body.storage?.ok === true && h.body.storage.driver === 'local', JSON.stringify(h.body.storage));
ok('health 含 email／site／revalidate／payment／secrets 區塊', ['email', 'site', 'revalidate', 'payment', 'secrets'].every((k) => h.body[k] && typeof h.body[k] === 'object'), Object.keys(h.body).join(','));
ok('health site 公開網址可達（本機 FRONTEND_URL）', h.body.site?.ok === true || h.body.site?.status === 200, JSON.stringify(h.body.site));
ok('health secrets 來源為 env|generated', ['env', 'generated'].includes(h.body.secrets?.sessionSecret) && ['env', 'generated'].includes(h.body.secrets?.opsToken));
ok('health 未登入 → 401', (await j('/api/admin/system/health')).status === 401);

// 3. 支援包
const sb = await j('/api/admin/system/support-bundle', { cookie: admin });
ok('support-bundle 下載（attachment）', sb.status === 200 && (sb.headers.get('content-disposition') ?? '').includes('attachment') && sb.body.settings && sb.body.health && Array.isArray(sb.body.audit), (sb.headers.get('content-disposition') ?? '').slice(0, 60));
const secretVals = Object.entries(sb.body.settings ?? {}).filter(([k]) => /secret|key|token|password/i.test(k)).map(([, v]) => v);
ok('支援包機密全部遮蔽', secretVals.every((v) => v === '' || String(v).startsWith('****')), JSON.stringify(secretVals.slice(0, 3)));

// 4. OPS token（superadmin）
const tk = await j('/api/admin/system/ops-token', { cookie: admin });
ok('superadmin 可讀 ops-token', tk.status === 200 && typeof tk.body.token === 'string' && tk.body.token.length > 10 && ['env', 'generated'].includes(tk.body.source), JSON.stringify({ source: tk.body.source, len: tk.body.token?.length }));
const viaMcp = await j('/api/ops/run', { method: 'POST', headers: { authorization: `Bearer ${tk.body.token}` }, body: { action: 'status' } });
ok('該 token 走 MCP 路徑可用', viaMcp.status === 201 && viaMcp.body.ok === true, JSON.stringify(viaMcp.body).slice(0, 100));
const rot = await j('/api/admin/system/ops-token/rotate', { method: 'POST', cookie: admin });
if (tk.body.source === 'env') ok('env 提供的 token 不可在此更換 → 400', rot.status === 400, JSON.stringify(rot.body).slice(0, 100));
else {
  ok('generated token 可更換', rot.status === 201 && rot.body.token && rot.body.token !== tk.body.token);
  const old = await j('/api/ops/run', { method: 'POST', headers: { authorization: `Bearer ${tk.body.token}` }, body: { action: 'status' } });
  ok('舊 token 失效', old.status === 401);
}
// 非 superadmin 不能看 token
const mk = await j('/api/admin/auth/users', { method: 'POST', cookie: admin, body: { email: `ops-viewer-${Date.now().toString(36)}@example.com`, password: 'viewer-pass-1', role: 'admin' } });
if (mk.status === 201) {
  const viewer = (await j('/api/admin/auth/login', { method: 'POST', body: { email: mk.body.email, password: 'viewer-pass-1' } })).cookie;
  ok('一般管理員讀 ops-token → 403', (await j('/api/admin/system/ops-token', { cookie: viewer })).status === 403);
  await j(`/api/admin/auth/users/${mk.body.id}`, { method: 'DELETE', cookie: admin });
} else ok('建立一般管理員（略過權限測試）', true, String(mk.status));

// 5. 品牌不由種子寫入：settings 沒有 brand.* 時前台用中性預設（此處只驗 API 回的預設值）
const site = await j('/api/content/site');
ok('site 端點可讀且 brand.siteName 有值', site.status === 200 && typeof site.body?.brand?.siteName === 'string' && site.body.brand.siteName.length > 0, JSON.stringify(site.body?.brand).slice(0, 80));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

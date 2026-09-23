// P29：完整匯出／備份／還原——匯出檔結構與遮蔽、立即備份→清單→下載（superadmin）→刪除、排程設定、OPS export_site、CLI 匯入到全新 SQLite 後列數一致（跨資料庫搬家）
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const B = process.env.API ?? 'http://localhost:4000';
const RUN = Date.now().toString(36).slice(-5).toLowerCase();
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie, headers = {} } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...headers, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0], headers: r.headers };
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
ok('admin login', !!admin);
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });

// 1. 匯出
const ex = await j('/api/admin/system/export', { cookie: admin });
ok('匯出（遮蔽）200、attachment、kind/tables/counts', ex.status === 200 && (ex.headers.get('content-disposition') ?? '').includes('attachment') && ex.body.kind === 'sitekit-export' && ex.body.tables && ex.body.counts, Object.keys(ex.body).join(','));
ok('匯出含 34 個模型且 User／Setting／Product 有列', ex.body.models?.length === 34 && ex.body.counts.User > 0 && ex.body.counts.Setting > 0 && ex.body.counts.Product > 0, JSON.stringify(ex.body.counts).slice(0, 120));
const secretRows = (ex.body.tables.Setting ?? []).filter((r) => r.isSecret || /secret|token|key/i.test(r.key));
ok('遮蔽版：機密設定 value 為空、passwordHash 為 null', secretRows.every((r) => r.value === '') && (ex.body.tables.User ?? []).every((u) => u.passwordHash === null));
const exFull = await j('/api/admin/system/export?secrets=1', { cookie: admin });
ok('含機密版：passwordHash 保留', exFull.status === 200 && exFull.body.includeSecrets === true && (exFull.body.tables.AdminUser ?? []).some((u) => typeof u.passwordHash === 'string' && u.passwordHash.length > 20));
ok('匯出未登入 → 401', (await j('/api/admin/system/export')).status === 401);

// 2. 備份清單／立即備份／下載／刪除
const b1 = await j('/api/admin/system/backups', { method: 'POST', cookie: admin });
ok('立即備份 → file/size', b1.status === 201 && typeof b1.body.file === 'string' && b1.body.file.endsWith('.json') && b1.body.size > 1000, JSON.stringify(b1.body).slice(0, 120));
const list = await j('/api/admin/system/backups', { cookie: admin });
ok('備份清單含剛建的檔、lastAt 已更新', list.status === 200 && list.body.files.some((f) => f.name === b1.body.file) && !!list.body.lastAt, JSON.stringify(list.body).slice(0, 160));
const dl = await j(`/api/admin/system/backups/${encodeURIComponent(b1.body.file)}`, { cookie: admin });
ok('下載備份檔（JSON、含機密）', dl.status === 200 && dl.body.kind === 'sitekit-export' && dl.body.includeSecrets === true);
ok('路徑穿越被擋', (await j('/api/admin/system/backups/..%2F..%2Fpackage.json', { cookie: admin })).status >= 400);
// 保留份數：設 keep=1 再備份 → 只剩 1 份
await act('update_settings', { settings: { 'backup.keep': '1', 'backup.daily': 'true' } });
const b2 = await j('/api/admin/system/backups', { method: 'POST', cookie: admin });
const list2 = await j('/api/admin/system/backups', { cookie: admin });
ok('backup.keep=1 → 只保留最新一份', b2.status === 201 && list2.body.files.length === 1 && list2.body.files[0].name === b2.body.file && list2.body.daily === true && list2.body.keep === 1, JSON.stringify(list2.body.files.map((f) => f.name)));
// OPS export_site
const ops = await act('export_site', {});
ok('OPS export_site 建備份檔', ops.body.ok && typeof ops.body.data?.file === 'string', JSON.stringify(ops.body).slice(0, 120));
const del = await j(`/api/admin/system/backups/${encodeURIComponent(ops.body.data.file)}`, { method: 'DELETE', cookie: admin });
ok('刪除備份檔', del.status === 200 && del.body.ok === true);
await act('update_settings', { settings: { 'backup.keep': '7', 'backup.daily': 'false' } });

// 3. 跨資料庫搬家：把含機密匯出檔用 CLI 匯入到全新 SQLite，列數一致
const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../..');
const tmp = resolve(root, 'data', `p29-${RUN}`);
mkdirSync(tmp, { recursive: true });
const file = resolve(tmp, 'export.json');
writeFileSync(file, JSON.stringify(exFull.body));
const dbUrl = `file:${tmp.replace(/\\/g, '/')}/site.db`;
const cli = resolve(root, 'apps/server/bin/sitekit.mjs');
const mig = spawnSync(process.execPath, [cli, 'migrate'], { env: { ...process.env, DATABASE_URL: dbUrl, SITEKIT_DATA_DIR: tmp }, encoding: 'utf8' });
ok('CLI migrate（全新 SQLite）', mig.status === 0, (mig.stderr || mig.stdout).slice(-200));
const imp = spawnSync(process.execPath, [cli, 'import', file, '--confirm'], { env: { ...process.env, DATABASE_URL: dbUrl, SITEKIT_DATA_DIR: tmp }, encoding: 'utf8' });
ok('CLI import --confirm', imp.status === 0 && /匯入完成|counts/.test(imp.stdout + imp.stderr), (imp.stderr || imp.stdout).slice(-240));
const { createPrisma } = require(resolve(root, 'packages/db/dist'));
const p2 = createPrisma({ url: dbUrl });
try {
  const [u, s, pr, o, ch, mi] = await Promise.all([p2.user.count(), p2.setting.count(), p2.product.count(), p2.order.count(), p2.chapter.count(), p2.menuItem.count()]);
  const c = exFull.body.counts;
  ok('SQLite 匯入後列數與匯出一致（User/Setting/Product/Order/Chapter/MenuItem）', u === c.User && s === c.Setting && pr === c.Product && o === c.Order && ch === c.Chapter && mi === c.MenuItem, JSON.stringify({ u, s, pr, o, ch, mi, c: { U: c.User, S: c.Setting, P: c.Product, O: c.Order, C: c.Chapter, M: c.MenuItem } }));
  const tpl = await p2.aiTemplate.findFirst({ where: { key: 'product-white-bg' } });
  ok('Json 欄位（inputFields）在 SQLite 端是陣列', Array.isArray(tpl?.inputFields));
  const adminRow = await p2.adminUser.findFirst({ where: { email: 'admin@example.com' } });
  ok('管理員含 passwordHash（可直接登入）', typeof adminRow?.passwordHash === 'string');
} finally {
  await p2.$disconnect();
}
try { rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

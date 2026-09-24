// P28：外掛機制——webhook 官方外掛已載入、設定欄位、webhook_test 動作（OPS／AI API 路徑）、事件 user.registered 實際推送（本機接收端驗簽章）、/api/ops/actions 含外掛動作
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
const B = process.env.API ?? 'http://localhost:4000';
const RUN = Date.now().toString(36).slice(-5).toLowerCase();
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
if (process.env.E2E_PLATFORM === 'workers') { console.log('SKIP p28 整檔（Workers：外掛載入需檔案系統，路線圖另作 Workers 外掛機制）'); process.exit(0); }

const j = async (path, { method = 'GET', body, cookie, headers = {} } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...headers, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
ok('admin login', !!admin);
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });

// 本機接收端
const received = [];
const srv = createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    received.push({ headers: req.headers, body });
    res.writeHead(200).end('ok');
  });
});
await new Promise((r) => srv.listen(4999, '127.0.0.1', r));
const SECRET = `s-${RUN}`;

// 1. 外掛清單與設定欄位
const pl = await j('/api/admin/system/plugins', { cookie: admin });
const wh = pl.body?.plugins?.find((p) => p.id === 'webhook');
ok('外掛頁：webhook 已載入且無錯誤', pl.status === 200 && wh && !wh.error, JSON.stringify(pl.body).slice(0, 160));
ok('外掛宣告 3 個設定欄位與 webhook_test 動作', wh?.settings?.length === 3 && wh?.actions?.includes('webhook_test'));
const acts = await j('/api/ops/actions', { headers: { authorization: `Bearer ${process.env.OPS_TOKEN ?? 'ci-ops-token'}` } });
const found = Array.isArray(acts.body) ? acts.body.find((a) => a.action === 'webhook_test') : null;
ok('/api/ops/actions 含外掛動作（標 plugin）', acts.status === 200 ? !!found && found.plugin === 'webhook' : acts.status === 401 || acts.status === 403, JSON.stringify(found ?? acts.status));

// 2. 設定 → webhook_test
const set = await act('update_settings', { settings: { 'webhook.urls': 'http://127.0.0.1:4999/hook', 'webhook.secret': SECRET, 'webhook.events': '' } });
ok('寫入 webhook 設定', set.body.ok);
const t = await act('webhook_test', { message: `ping ${RUN}` });
ok('webhook_test 動作可執行、回每個網址結果', t.body.ok && t.body.data?.results?.[0]?.ok === true && t.body.data.results[0].status === 200, JSON.stringify(t.body).slice(0, 200));
await new Promise((r) => setTimeout(r, 300));
const first = received.find((x) => x.headers['x-sitekit-event'] === 'test');
ok('接收端收到 test 事件（含 delivery 與簽章標頭）', !!first && !!first.headers['x-sitekit-delivery'] && String(first.headers['x-sitekit-signature']).startsWith('sha256='));
if (first) {
  const expect = 'sha256=' + createHmac('sha256', SECRET).update(first.body).digest('hex');
  ok('HMAC-SHA256 簽章正確', first.headers['x-sitekit-signature'] === expect);
  const payload = JSON.parse(first.body);
  ok('payload 含 event／at／site／data.message', payload.event === 'test' && payload.at && payload.site && payload.data?.message === `ping ${RUN}`);
}
const audit = await j('/api/admin/audit?limit=5', { cookie: admin });
ok('外掛動作進稽核（mutating）', audit.body.some((a) => a.action === 'webhook_test'), JSON.stringify(audit.body.map((a) => a.action)));

// 3. 真事件：註冊會員 → user.registered
const reg = await j('/api/auth/register', { method: 'POST', body: { email: `hook-${RUN}@example.com`, password: 'password123' } });
ok('註冊會員', reg.status === 201 || reg.status === 200);
let ev = null;
for (let i = 0; i < 20 && !ev; i++) { await new Promise((r) => setTimeout(r, 250)); ev = received.find((x) => x.headers['x-sitekit-event'] === 'user.registered' && x.body.includes(`hook-${RUN}@example.com`)); }
ok('接收端收到 user.registered 事件', !!ev, String(received.map((x) => x.headers['x-sitekit-event'])));

// 4. 事件篩選：只送 order.paid 時，註冊不再推送
await act('update_settings', { settings: { 'webhook.events': 'order.paid' } });
const before = received.length;
await j('/api/auth/register', { method: 'POST', body: { email: `hook2-${RUN}@example.com`, password: 'password123' } });
await new Promise((r) => setTimeout(r, 800));
ok('webhook.events 篩選生效（註冊事件不推送）', received.length === before);

// 清理
await act('update_settings', { settings: { 'webhook.urls': '', 'webhook.secret': '', 'webhook.events': '' } });
await act('delete_member', { idOrEmail: `hook-${RUN}@example.com` });
await act('delete_member', { idOrEmail: `hook2-${RUN}@example.com` });
srv.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

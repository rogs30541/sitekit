// needs: web
// P22：後台產圖任務（不扣點、系統帳號）＋前台工作站已移除
const B = process.env.API ?? 'http://localhost:4000';
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
await j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action: 'update_settings', params: { settings: { 'ai.provider': 'mock' } } } });
const tpls = (await j('/api/studio/templates')).body;
const t = tpls.find((x) => x.key === 'product-white-bg');
ok('模板存在', !!t);
const bad = await j('/api/admin/studio/jobs', { method: 'POST', cookie: admin, body: { templateId: t.id, inputs: {} } });
ok('缺必填 → 400', bad.status === 400 && String(bad.body.message).includes('請填寫'));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const job = await j('/api/admin/studio/jobs', { method: 'POST', cookie: admin, body: { templateId: t.id, inputs: { free_notes: '純白背景' }, quality: 'high', images: [png] } });
ok('後台建立任務：不扣點、byok、inputs 記 actor 與參考圖', job.status === 201 && job.body.costPoints === 0 && job.body.byok === true && job.body.inputs.__actor && job.body.inputs.__images.length === 1, JSON.stringify(job.body).slice(0, 160));
let done = null;
for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 700)); const g = await j(`/api/admin/studio/jobs/${job.body.id}`, { cookie: admin }); if (['succeeded', 'failed'].includes(g.body.status)) { done = g.body; break; } }
ok('任務完成（mock）', done?.status === 'succeeded' && !!done.resultUrl, JSON.stringify(done).slice(0, 120));
const list = (await j('/api/admin/studio/jobs?limit=5', { cookie: admin })).body;
ok('後台任務列表含此任務', list.some((x) => x.id === job.body.id));
const cancelDone = await j(`/api/admin/studio/jobs/${job.body.id}/cancel`, { method: 'POST', cookie: admin });
ok('已完成任務不可取消 → 400', cancelDone.status === 400);
const anon = await j('/api/admin/studio/jobs', { method: 'POST', body: { prompt: 'x' } });
ok('未登入 → 401', anon.status === 401);
const web = await fetch('http://localhost:3000/studio').then((r) => r.status).catch(() => 0);
ok('前台 /studio 已移除（404 或 web 未啟動）', web === 404 || web === 0, String(web));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

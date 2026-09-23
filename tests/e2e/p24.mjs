// P24：Gemini 供應商（文字模型偵測／產圖模型彙整／任務 provider:model／OPS generate_image provider 限制）
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
const act = (action, params) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
// 清空金鑰 → mock
await act('update_settings', { settings: { 'ai.provider': '', 'openai.apiKey': '', 'gemini.apiKey': '', 'ai.imageModel': '' } });
let m = await j('/api/admin/studio/models', { cookie: admin });
const envOpenai = m.body.providers?.includes('openai'); // 本機 .env 有 OPENAI_API_KEY 時 openai 仍在
ok('無 Gemini 金鑰 → providers 不含 gemini；無任何金鑰則 mock:mock', m.status === 200 && !m.body.providers?.includes('gemini') && (envOpenai || m.body.default === 'mock:mock'), JSON.stringify(m.body).slice(0, 160));
// gemini 無效金鑰 → providers 含 gemini、errors.gemini、不炸
await act('update_settings', { settings: { 'gemini.apiKey': 'AIza-invalid' } });
m = await j('/api/admin/studio/models', { cookie: admin });
ok('Gemini 無效金鑰 → providers 含 gemini、errors.gemini', m.status === 200 && m.body.providers?.includes('gemini') && typeof m.body.errors?.gemini === 'string' && !m.body.models.some((x) => x.provider === 'gemini'), JSON.stringify(m.body).slice(0, 200));
// 指令台文字模型偵測：gemini 無效金鑰回錯誤
const cm = await j('/api/admin/ai/command/models', { method: 'POST', cookie: admin, body: { provider: 'gemini', apiKey: 'AIza-invalid' } });
ok('command/models gemini 無效金鑰回錯誤與預設 gemini-2.5-pro', cm.status === 201 && cm.body.default === 'gemini-2.5-pro' && typeof cm.body.error === 'string' && cm.body.models.length === 0, JSON.stringify(cm.body).slice(0, 160));
const cfg = await j('/api/admin/ai/command/config', { cookie: admin });
ok('config 含 geminiConfigured=true', cfg.status === 200 && cfg.body.geminiConfigured === true, JSON.stringify(cfg.body).slice(0, 120));
// 任務：mock:mock 可建；openai:xxx 無金鑰 → 400
const jb = await j('/api/admin/studio/jobs', { method: 'POST', cookie: admin, body: { prompt: '測試佔位圖', quality: 'standard', model: 'mock:mock' } });
ok('後台任務 mock:mock 建立', jb.status === 201 && jb.body.provider === 'mock', JSON.stringify(jb.body).slice(0, 120));
const jo = await j('/api/admin/studio/jobs', { method: 'POST', cookie: admin, body: { prompt: 'x', quality: 'standard', model: 'openai:gpt-image-1' } });
ok('後台任務 openai：無金鑰→400／有 env 金鑰→建立 provider=openai', envOpenai ? jo.status === 201 && jo.body.provider === 'openai' && jo.body.inputs.__model === 'gpt-image-1' : jo.status === 400, JSON.stringify(jo.body).slice(0, 120));
if (jo.status === 201) await j(`/api/admin/studio/jobs/${jo.body.id}/cancel`, { method: 'POST', cookie: admin });
const ja = await j('/api/admin/studio/jobs', { method: 'POST', cookie: admin, body: { prompt: 'x', quality: 'standard', model: 'anthropic:claude-sonnet-5' } });
ok('後台任務 anthropic 不接受（落回預設供應商，非 anthropic）', ja.status !== 201 || ja.body.provider !== 'anthropic', JSON.stringify(ja.body).slice(0, 120));
// 等 mock 任務完成
let done; for (let i = 0; i < 20 && !done; i++) { await new Promise((r) => setTimeout(r, 500)); const g = await j(`/api/admin/studio/jobs/${jb.body.id}`, { cookie: admin }); if (g.body.status === 'succeeded' || g.body.status === 'failed') done = g.body; }
ok('mock 任務完成 succeeded', done?.status === 'succeeded', JSON.stringify(done).slice(0, 160));
// OPS generate_image：provider gemini 無效金鑰 → 錯誤訊息（不是靜默 mock）；provider anthropic 不合法 → 落回設定
await act('update_settings', { settings: { 'gemini.apiKey': '' } });
const gi = await act('generate_image', { provider: 'gemini', prompt: 'x' });
ok('OPS generate_image provider=gemini 無金鑰 → 報錯不靜默', gi.status >= 400 || gi.body?.ok === false || /金鑰/.test(JSON.stringify(gi.body)), JSON.stringify(gi.body).slice(0, 160));
const gm = await act('generate_image', { provider: 'mock', prompt: '佔位' });
ok('OPS generate_image provider=mock → 佔位圖 url', gm.status < 400 && /url/.test(JSON.stringify(gm.body)), JSON.stringify(gm.body).slice(0, 160));
// 復原
await act('update_settings', { settings: { 'gemini.apiKey': '', 'ai.commandProvider': 'mock' } });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

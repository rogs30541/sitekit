// P39：AI 工作站完善——對話記錄落庫（PUT/GET/PATCH/DELETE /api/admin/ai/conversations、本人隔離）、OPS list_ai_conversations（系統類、指令台排除）；
//      AI 擬回覆草稿 draft_contact_reply（mock 規則：只用原訊息＋要點、缺事實留【請補充】、不寄信不改狀態）＋後台 POST /api/admin/messages/:id/draft；
//      mock 指令台「擬回覆」→ 即時執行回草稿、「未讀表單…擬一句回覆」仍走列表；MCP 名單含兩新工具
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
await act('update_settings', { settings: { 'ai.commandProvider': 'mock', 'mail.adminTo': 'owner@example.com' } });

// 1) 對話記錄落庫
const turns = [{ role: 'user', text: `列出商品 ${RUN}` }, { role: 'assistant', text: '（mock）已列出商品', executed: [{ action: 'list_products', params: {}, ok: true, data: [] }] }];
const c1 = await j('/api/admin/ai/conversations', { method: 'PUT', cookie: admin, body: { turns } });
ok('PUT 新建對話：回 id／title（取第一句指令）／turnCount', c1.status < 300 && c1.body?.id && c1.body.title === `列出商品 ${RUN}` && c1.body.turnCount === 2, JSON.stringify(c1.body));
const id1 = c1.body?.id;
const c2 = await j('/api/admin/ai/conversations', { method: 'PUT', cookie: admin, body: { id: id1, turns: [...turns, { role: 'user', text: '第二句' }] } });
ok('PUT 帶 id 更新同一筆（不新建）', c2.status < 300 && c2.body?.id === id1 && c2.body.turnCount === 3);
const g1 = await j(`/api/admin/ai/conversations/${id1}`, { cookie: admin });
ok('GET :id 回完整 turns（含 executed 卡）', g1.status === 200 && Array.isArray(g1.body?.turns) && g1.body.turns.length === 3 && g1.body.turns[1].executed?.[0]?.action === 'list_products');
const l1 = await j('/api/admin/ai/conversations?limit=50', { cookie: admin });
ok('GET 列表含這筆且不含 turns 內容', l1.status === 200 && l1.body.some((c) => c.id === id1 && c.turns === undefined && c.turnCount === 3));
const rn = await j(`/api/admin/ai/conversations/${id1}`, { method: 'PATCH', cookie: admin, body: { title: `改名 ${RUN}` } });
ok('PATCH 改標題', rn.status < 300 && rn.body?.title === `改名 ${RUN}`);
const bad = await j('/api/admin/ai/conversations', { method: 'PUT', cookie: admin, body: { turns: 'x' } });
ok('turns 非陣列被拒 400', bad.status === 400);
const empty = await j('/api/admin/ai/conversations', { method: 'PUT', cookie: admin, body: { turns: [{ role: 'x' }] } });
ok('沒有合法回合被拒 400', empty.status === 400);
// 另一位管理員看不到
const other = await act('create_admin', { email: `other-${RUN}@example.com`, password: 'other-pass-12345', role: 'admin' });
const otherCookie = (await j('/api/admin/auth/login', { method: 'POST', body: { email: `other-${RUN}@example.com`, password: 'other-pass-12345' } })).cookie;
const gOther = await j(`/api/admin/ai/conversations/${id1}`, { cookie: otherCookie });
const lOther = await j('/api/admin/ai/conversations', { cookie: otherCookie });
ok('其他管理員 GET :id 404、列表不含', other.body?.ok === true && gOther.status === 404 && lOther.status === 200 && !lOther.body.some((c) => c.id === id1), `${gOther.status}/${lOther.status}`);
const putOther = await j('/api/admin/ai/conversations', { method: 'PUT', cookie: otherCookie, body: { id: id1, turns } });
ok('其他管理員帶別人的 id 儲存被拒 404', putOther.status === 404);
const noauth = await j(`/api/admin/ai/conversations`);
ok('未登入 401', noauth.status === 401);
// OPS 摘要（系統類）
const opsList = await act('list_ai_conversations', { limit: 100 });
ok('OPS list_ai_conversations 回摘要（含 adminId／title，不含 turns）', opsList.body?.ok === true && opsList.body.data.some((c) => c.id === id1 && c.adminId && c.turns === undefined));
const cfg = await j('/api/admin/ai/command/config', { cookie: admin });
ok('指令台動作清單排除 list_ai_conversations、含 draft_contact_reply', cfg.status === 200 && !cfg.body.actions.some((a) => a.action === 'list_ai_conversations') && cfg.body.actions.some((a) => a.action === 'draft_contact_reply' && a.mutating === false));
const del = await j(`/api/admin/ai/conversations/${id1}`, { method: 'DELETE', cookie: admin });
const gone = await j(`/api/admin/ai/conversations/${id1}`, { cookie: admin });
ok('DELETE 後 GET 404', del.status < 300 && gone.status === 404);
await act('delete_admin', { idOrEmail: `other-${RUN}@example.com` });

// 2) AI 擬回覆草稿（mock 規則）
const before = (await act('storage_status')).body?.data?.recent ?? [];
const sub = await j('/api/content/contact', { method: 'POST', body: { name: '訪客丙', email: `v3+${RUN}@example.com`, subject: `合作方案 ${RUN}`, message: '您好，想了解企業方案報價與導入時程。\n謝謝。' } });
ok('送出表單', sub.body?.ok === true && !!sub.body.id);
const mid = sub.body.id;
const d1 = await act('draft_contact_reply', { id: mid });
ok('draft_contact_reply（無要點）：草稿含訪客姓名、原主旨、【請補充】佔位、網站名稱；mock=true、subject=Re:', d1.body?.ok === true && d1.body.data.draft.includes('訪客丙') && d1.body.data.draft.includes(`合作方案 ${RUN}`) && d1.body.data.draft.includes('【請補充') && d1.body.data.mock === true && d1.body.data.subject === `Re: 合作方案 ${RUN}`, JSON.stringify(d1.body?.data?.draft).slice(0, 160));
const d2 = await act('draft_contact_reply', { id: mid, points: '下週一上午由業務回電確認需求，報價單隨後另寄。', tone: '親切' });
ok('帶要點：草稿用要點取代佔位、不含【請補充】', d2.body?.ok === true && d2.body.data.draft.includes('下週一上午由業務回電') && !d2.body.data.draft.includes('【請補充') && d2.body.data.tone === '親切');
const m1 = await j(`/api/admin/messages?status=new`, { cookie: admin });
const row = (m1.body?.items ?? []).find((x) => x.id === mid);
ok('擬稿不改狀態（仍 new）、不存 reply', row && row.status === 'new' && !row.reply);
await new Promise((r) => setTimeout(r, 300));
const after = (await act('storage_status')).body?.data?.recent ?? [];
ok('擬稿不寄信（通知紀錄無 contact_reply 給該訪客）', !after.some((r) => r.kind === 'contact_reply' && r.to === `v3+${RUN}@example.com`), `before=${before.length} after=${after.length}`);
const viaApi = await fetch(`${B}/api/admin/messages/${mid}/draft`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: admin }, body: JSON.stringify({ points: '已安排 demo' }) });
const viaApiJ = await viaApi.json();
ok('後台 POST /api/admin/messages/:id/draft 回 draft', viaApi.status < 300 && typeof viaApiJ.draft === 'string' && viaApiJ.draft.includes('已安排 demo'));
const badId = await act('draft_contact_reply', { id: 'nope' });
ok('不存在的訊息 → ok=false', badId.body?.ok === false);

// 3) mock 指令台
const c3 = await cmd(`幫訊息 ${mid} 擬回覆草稿，語氣 親切，要點：週三前回電`);
ok('mock：擬回覆 → draft_contact_reply 即時執行、回覆貼出草稿含要點', (c3.body?.executed ?? []).some((e) => e.action === 'draft_contact_reply' && e.ok) && /週三前回電/.test(c3.body?.reply ?? '') && !(c3.body?.pending ?? []).length, (c3.body?.reply ?? '').slice(0, 100));
const c4 = await cmd('未讀的聯絡表單有哪些？依急迫度排序，每則幫我擬一句回覆');
ok('mock：沒有 id 的「擬一句回覆」仍走 list_contact_messages', (c4.body?.executed ?? []).some((e) => e.action === 'list_contact_messages' && e.ok));
const c5 = await cmd(`回覆訊息 ${mid}「${d2.body.data.draft.slice(0, 40)}」`);
ok('mock：審閱後「回覆訊息 id「…」」→ reply_contact_message 待確認', (c5.body?.pending ?? []).some((p) => p.action === 'reply_contact_message' && p.params.id === mid));

// 收尾
await act('delete_contact_message', { id: mid });
await act('update_settings', { settings: { 'mail.adminTo': '' } });
const mcp = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'mcp', 'server.mjs'), 'utf8');
ok('mcp/server.mjs 含 sitekit_draft_contact_reply／sitekit_list_ai_conversations', ['sitekit_draft_contact_reply', 'sitekit_list_ai_conversations'].every((n) => mcp.includes(`'${n}'`)));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

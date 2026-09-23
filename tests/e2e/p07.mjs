// needs: web
// P7 本機端到端：後台 Email 驗證註冊（第一位／白名單／非白名單）、忘記密碼／重設、個人資料／改密碼、mock OAuth（合併帳號）、課程問答與公告（學員＋後台＋OPS）
const B = process.env.API ?? 'http://localhost:4000';
const W = process.env.WEB ?? 'http://localhost:3000';
const RUN = Date.now().toString(36).slice(-4).toLowerCase();
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie, base = B } = {}) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  const cookies = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]);
  return { status: r.status, body: b, cookie: cookies[0], cookies, location: r.headers.get('location') };
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
ok('admin login', !!admin);

// 1. 後台 Email 驗證註冊
const gone = await j('/api/admin/auth/bootstrap', { method: 'POST', body: { email: 'x@example.com', password: 'xxxxxxxx' } });
ok('舊 bootstrap 端點已移除 404', gone.status === 404);
const notAllowed = await j('/api/admin/auth/register/request', { method: 'POST', body: { email: `nobody-${RUN}@example.com` } });
ok('非白名單：回 ok 但不寄（防列舉）', notAllowed.status === 201 && notAllowed.body.sent === false && !notAllowed.body.devCode);
await act('update_settings', { settings: { 'admin.registerAllowlist': `ops-${RUN}@example.com, @allowed-${RUN}.test` } });
const req1 = await j('/api/admin/auth/register/request', { method: 'POST', body: { email: `ops-${RUN}@example.com` } });
ok('白名單 email：寄出驗證碼（dev 回 devCode）', req1.body.sent === true && /^\d{6}$/.test(req1.body.devCode ?? '') && req1.body.first === false, JSON.stringify(req1.body));
const wrong = await j('/api/admin/auth/register/confirm', { method: 'POST', body: { email: `ops-${RUN}@example.com`, code: '000000', password: 'ops-pass-123' } });
ok('錯誤驗證碼 → 400', wrong.status === 400);
const conf = await j('/api/admin/auth/register/confirm', { method: 'POST', body: { email: `ops-${RUN}@example.com`, code: req1.body.devCode, password: 'ops-pass-123', displayName: 'Ops' } });
ok('正確驗證碼 → 建立 admin 並登入', conf.status === 201 && conf.body.admin.role === 'admin' && conf.cookie?.startsWith('sk_admin='));
const reuse = await j('/api/admin/auth/register/confirm', { method: 'POST', body: { email: `ops-${RUN}@example.com`, code: req1.body.devCode, password: 'ops-pass-123' } });
ok('驗證碼一次性', reuse.status === 400 || reuse.status === 409);
const domainReq = await j('/api/admin/auth/register/request', { method: 'POST', body: { email: `someone@allowed-${RUN}.test` } });
ok('白名單網域也可', domainReq.body.sent === true);
const status = await j('/api/admin/auth/status');
ok('status 有管理員', status.body.needsBootstrap === false);
await act('delete_admin', { idOrEmail: `ops-${RUN}@example.com` });

// 2. 忘記密碼／重設
const memberEmail = `m7-${RUN}@example.com`;
const reg = await j('/api/auth/register', { method: 'POST', body: { email: memberEmail, password: 'member-pass-1', displayName: 'M7' } });
ok('會員註冊', reg.status === 201);
const forgot = await j('/api/auth/forgot', { method: 'POST', body: { email: memberEmail } });
ok('forgot 回 devToken', forgot.body.ok && forgot.body.devToken?.length === 64);
const forgotNone = await j('/api/auth/forgot', { method: 'POST', body: { email: `ghost-${RUN}@example.com` } });
ok('不存在 email 也回 ok、無 token', forgotNone.body.ok && !forgotNone.body.devToken);
const badReset = await j('/api/auth/reset', { method: 'POST', body: { token: 'x'.repeat(64), password: 'new-pass-1234' } });
ok('無效 token → 400', badReset.status === 400);
const reset = await j('/api/auth/reset', { method: 'POST', body: { token: forgot.body.devToken, password: 'new-pass-1234' } });
const oldLogin = await j('/api/auth/login', { method: 'POST', body: { email: memberEmail, password: 'member-pass-1' } });
const newLogin = await j('/api/auth/login', { method: 'POST', body: { email: memberEmail, password: 'new-pass-1234' } });
ok('重設後舊密碼失效、新密碼可登入', reset.status === 201 && oldLogin.status === 401 && newLogin.status === 201);
const reuseTok = await j('/api/auth/reset', { method: 'POST', body: { token: forgot.body.devToken, password: 'again-pass-1' } });
ok('reset token 一次性', reuseTok.status === 400);
const member = newLogin.cookie;
const prof = await j('/api/auth/me', { method: 'PATCH', cookie: member, body: { displayName: 'M7 改名' } });
ok('改顯示名稱', prof.status === 200 && prof.body.user.displayName === 'M7 改名');
const chBad = await j('/api/auth/change-password', { method: 'POST', cookie: member, body: { currentPassword: 'wrong', newPassword: 'zzzzzzzz1' } });
const chOk = await j('/api/auth/change-password', { method: 'POST', cookie: member, body: { currentPassword: 'new-pass-1234', newPassword: 'final-pass-1' } });
ok('變更密碼：舊密碼錯 400、正確 201', chBad.status === 400 && chOk.status === 201);

// 3. mock OAuth：新用戶 → 建立；同 sub 再登入 → 同一人；email 相同 → 併入既有會員
const providers = await j('/api/auth/oauth/providers');
ok('providers 含 mock（非 production）', providers.body.some((p) => p.id === 'mock'));
const start = await j(`/api/auth/oauth/mock/start?next=/member&sub=sub-${RUN}&email=oauth-${RUN}@example.com&name=OAuth%20User`);
const stateCookie = start.cookies.find((c) => c.startsWith('sk_oauth='));
ok('start → 302 到 callback 並種 state cookie', start.status === 302 && start.location?.includes('/api/auth/oauth/mock/callback?code=') && !!stateCookie, start.location?.slice(0, 60));
const cbUrl = new URL(start.location);
const cb = await j(cbUrl.pathname + cbUrl.search, { cookie: stateCookie });
const sess = cb.cookies.find((c) => c.startsWith('sk_session='));
ok('callback → 建 session、導回 /member', cb.status === 302 && cb.location?.endsWith('/member') && !!sess, cb.location);
const me1 = await j('/api/auth/me', { cookie: sess });
ok('OAuth 新會員 role=user、名稱帶入', me1.body.authenticated && me1.body.user.role === 'user' && me1.body.user.displayName === 'OAuth User' && me1.body.user.email === `oauth-${RUN}@example.com`);
const badState = await j(cbUrl.pathname + cbUrl.search, { cookie: 'sk_oauth=bad:%2Fmember' });
ok('state 不符 → 導回 login?oauth=failed', badState.status === 302 && badState.location?.includes('oauth=failed'));
const start2 = await j(`/api/auth/oauth/mock/start?next=/member&sub=sub-${RUN}&email=other-${RUN}@example.com`);
const cb2u = new URL(start2.location);
const cb2 = await j(cb2u.pathname + cb2u.search, { cookie: start2.cookies.find((c) => c.startsWith('sk_oauth=')) });
const me2 = await j('/api/auth/me', { cookie: cb2.cookies.find((c) => c.startsWith('sk_session=')) });
ok('同 sub 再登入＝同一會員（以 identity 為準）', me2.body.user.id === me1.body.user.id);
const start3 = await j(`/api/auth/oauth/mock/start?next=/member&sub=other-sub-${RUN}&email=${memberEmail}`);
const cb3u = new URL(start3.location);
const cb3 = await j(cb3u.pathname + cb3u.search, { cookie: start3.cookies.find((c) => c.startsWith('sk_oauth=')) });
const me3 = await j('/api/auth/me', { cookie: cb3.cookies.find((c) => c.startsWith('sk_session=')) });
ok('email 相同 → 併入既有會員（帳號合併）', me3.body.user.email === memberEmail && me3.body.user.displayName === 'M7 改名');
const evil = await j('/api/auth/oauth/mock/start?next=https://evil.example');
ok('next 只接受站內路徑', evil.status === 302 && decodeURIComponent(decodeURIComponent(evil.cookies.find((c) => c.startsWith('sk_oauth=')) ?? '')).endsWith(':/member'));

// 4. 課程問答與公告
const buyer = (await j('/api/auth/login', { method: 'POST', body: { email: 'tester@example.com', password: 'password123' } })).cookie;
const courseList = (await j('/api/catalog/courses')).body;
const course = courseList.find((c) => c.slug === 'demo-course') ?? courseList[0];
// 確保 tester 持有此課程（前面的測試可能退款撤銷過授權）
{
  const me = (await j('/api/auth/me', { cookie: buyer })).body.user;
  await j('/api/admin/orders/grant', { method: 'POST', cookie: admin, body: { userId: me.id, productId: course.productId ?? course.product?.id } });
}
const chapterId = (await j(`/api/learn/courses/${course.slug}`, { cookie: buyer })).body.chapters[0]?.id;
const noEnt = await j(`/api/learn/courses/${course.slug}/questions`, { method: 'POST', cookie: member, body: { body: '我沒買課' } });
ok('未購買不能提問 403', noEnt.status === 403);
const q = await j(`/api/learn/courses/${course.slug}/questions`, { method: 'POST', cookie: buyer, body: { body: `第三章聽不懂 ${RUN}`, chapterId } });
ok('學員提問（帶章節）', q.status === 201 && q.body.mine === true && q.body.chapter?.title, q.body.id);
const comm = await j(`/api/learn/courses/${course.slug}/community`, { cookie: member });
ok('其他登入者可見公開提問', comm.status === 200 && comm.body.questions.some((x) => x.id === q.body.id && x.mine === false));
const list = await act('list_questions', { slug: course.slug, status: 'open' });
ok('OPS list_questions', list.body.ok && list.body.data.some((x) => x.id === q.body.id));
const ans = await act('answer_question', { id: q.body.id, answer: `請看 2:30 的說明 ${RUN}` });
ok('OPS answer_question', ans.body.ok && ans.body.data.status === 'answered');
const comm2 = await j(`/api/learn/courses/${course.slug}/community`, { cookie: buyer });
ok('學員看到回覆', comm2.body.questions.find((x) => x.id === q.body.id)?.answer?.includes(RUN));
const hide = await j(`/api/admin/questions/${q.body.id}`, { method: 'PATCH', cookie: admin, body: { isPublic: false } });
const comm3 = await j(`/api/learn/courses/${course.slug}/community`, { cookie: member });
ok('設為不公開 → 其他人看不到、本人仍看得到', hide.status === 200 && !comm3.body.questions.some((x) => x.id === q.body.id) && (await j(`/api/learn/courses/${course.slug}/community`, { cookie: buyer })).body.questions.some((x) => x.id === q.body.id));
const annc = await act('post_announcement', { slug: course.slug, title: `公告 ${RUN}`, body: '下週直播' });
ok('OPS post_announcement', annc.body.ok && annc.body.data.id);
const comm4 = await j(`/api/learn/courses/${course.slug}/community`, { cookie: member });
ok('公告可見', comm4.body.announcements.some((a) => a.title === `公告 ${RUN}`));
const adminQ = await j(`/api/admin/courses/${course.id}/questions`, { cookie: admin });
ok('後台課程問答列表（含 email）', adminQ.status === 200 && adminQ.body.some((x) => x.id === q.body.id && x.user.email));
const st = await act('storage_status');
const kinds = st.body.data.recent.map((r) => r.kind);
ok('通知：new_question／question_answered／password_reset／admin_register', ['new_question', 'question_answered', 'password_reset', 'admin_register'].every((k) => kinds.includes(k)), JSON.stringify(kinds.slice(0, 10)));
await fetch(`${B}/api/admin/announcements/${annc.body.data.id}`, { method: 'DELETE', headers: { cookie: admin } });

// 5. 前台頁面
const loginHtml = await (await fetch(`${W}/login`)).text();
ok('/login 有忘記密碼連結', loginHtml.includes('/forgot-password'));
ok('/forgot-password、/reset-password、/admin/login 可開', (await fetch(`${W}/forgot-password`)).status === 200 && (await fetch(`${W}/reset-password?token=x`)).status === 200 && (await (await fetch(`${W}/admin/login`)).text()).includes('註冊管理員'));
const classroom = await (await fetch(`${W}/classroom/${course.slug}/${chapterId}`, { headers: { cookie: buyer } })).text();
ok('教室頁含問答／公告面板', classroom.includes('問答（') && classroom.includes('公告（'));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

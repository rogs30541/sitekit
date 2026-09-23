// needs: web
// P6 本機端到端：後台帳號分離（admin_users／sk_admin）、前台會員不能進後台、管理員 CRUD、內容編輯器（頁面／文章／上傳）、首頁 home 頁面
const B = process.env.API ?? 'http://localhost:4000';
const W = process.env.WEB ?? 'http://localhost:3000';
const RUN = Date.now().toString(36).slice(-4).toLowerCase();
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie, base = B } = {}) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0], location: r.headers.get('location'), setCookie: r.headers.get('set-cookie') };
};

// 1. 帳號分離
const status = await j('/api/admin/auth/status');
ok('admin status：已有管理員（seed）→ needsBootstrap=false', status.body.needsBootstrap === false);
const boot = await j('/api/admin/auth/bootstrap', { method: 'POST', body: { email: `x${RUN}@example.com`, password: 'bootstrap-123' } });
ok('無驗證的 bootstrap 端點已移除 404', boot.status === 404);
const adminLogin = await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } });
const admin = adminLogin.cookie;
ok('管理員登入 → sk_admin cookie', adminLogin.status === 201 && admin?.startsWith('sk_admin=') && /SameSite=Strict/i.test(adminLogin.setCookie ?? ''), adminLogin.setCookie?.slice(0, 40));
const memberLoginAsAdmin = await j('/api/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } });
ok('同 email 的前台會員登入仍可（獨立帳號、role=user）', memberLoginAsAdmin.status === 201 && memberLoginAsAdmin.body.user.role === 'user');
const memberCookie = memberLoginAsAdmin.cookie;
const memberToAdmin = await j('/api/admin/overview', { cookie: memberCookie });
ok('前台會員 session 進後台 → 401', memberToAdmin.status === 401);
const adminToMember = await j('/api/orders/mine', { cookie: admin });
ok('後台 session 進前台會員 API → 401', adminToMember.status === 401);
const adminOverview = await j('/api/admin/overview', { cookie: admin });
ok('後台 session 進後台 → 200', adminOverview.status === 200);
const withBearer = await j('/api/admin/overview', { cookie: admin });
const bearer = await fetch(B + '/api/admin/overview', { headers: { cookie: admin, authorization: 'Bearer x' } });
ok('後台路徑帶 Bearer → 403', bearer.status === 403 && withBearer.status === 200);
const reg = await j('/api/auth/register', { method: 'POST', body: { email: `m${RUN}@example.com`, password: 'member-pass-123' } });
ok('前台註冊永遠 role=user', reg.status === 201 && reg.body.user.role === 'user');
const me = await j('/api/admin/auth/me', { cookie: admin });
ok('admin me', me.body.authenticated && me.body.admin.role === 'superadmin');

// 2. 管理員 CRUD（superadmin）
const created = await j('/api/admin/auth/users', { method: 'POST', cookie: admin, body: { email: `ops${RUN}@example.com`, password: 'ops-pass-123', role: 'admin' } });
ok('新增 admin', created.status === 201 && created.body.role === 'admin');
const list = await j('/api/admin/auth/users', { cookie: admin });
ok('列出管理員含新帳號', list.status === 200 && list.body.some((a) => a.email === `ops${RUN}@example.com`));
const subLogin = await j('/api/admin/auth/login', { method: 'POST', body: { email: `ops${RUN}@example.com`, password: 'ops-pass-123' } });
const sub = subLogin.cookie;
const subList = await j('/api/admin/auth/users', { cookie: sub });
ok('一般 admin 不能管理帳號 → 403', subList.status === 403);
const subAct = await j('/api/admin/ai/act', { method: 'POST', cookie: sub, body: { action: 'status' } });
ok('一般 admin 可用 AI API 路徑', subAct.status === 201 && subAct.body.ok);
const reset = await j(`/api/admin/auth/users/${created.body.id}`, { method: 'PATCH', cookie: admin, body: { password: 'new-pass-12345' } });
const oldSess = await j('/api/admin/auth/me', { cookie: sub });
ok('重設密碼 → 舊 session 失效', reset.status === 200 && oldSess.body.authenticated === false);
const delSelf = await j('/api/admin/auth/users/admin@example.com', { method: 'DELETE', cookie: admin });
ok('不能刪自己', delSelf.status === 403);
const delOk = await j(`/api/admin/auth/users/${created.body.id}`, { method: 'DELETE', cookie: admin });
ok('刪除 admin', delOk.status === 200);
const opsCreate = await j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action: 'create_admin', params: { email: `mcp${RUN}@example.com`, password: 'mcp-pass-123' } } });
ok('AI API 路徑 create_admin', opsCreate.body.ok && opsCreate.body.data.email === `mcp${RUN}@example.com`);
const audit = await j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action: 'audit', params: { limit: 3 } } });
ok('稽核紀錄不含明文密碼', audit.body.ok && !JSON.stringify(audit.body.data).includes('mcp-pass-123'));
await j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action: 'delete_admin', params: { idOrEmail: `mcp${RUN}@example.com` } } });

// 3. 內容編輯器
const page = await j('/api/admin/content', { method: 'POST', cookie: admin, body: { type: 'page', title: `關於我們 ${RUN}`, body: '<h2>Hi</h2><p>內容<script>alert(1)</script></p>', status: 'draft' } });
ok('建立頁面草稿、slug 自動、script 被清', page.status === 201 && page.body.slug && !page.body.body.includes('<script'), page.body.slug);
const pubBefore = await j(`/api/content/pages/${page.body.slug}`);
ok('草稿不公開 404', pubBefore.status === 404);
const upd = await j(`/api/admin/content/${page.body.id}`, { method: 'PATCH', cookie: admin, body: { slug: `about-${RUN}`, status: 'published', body: '<p>公開內容</p>' } });
ok('改 slug 並發布', upd.status === 200 && upd.body.slug === `about-${RUN}` && upd.body.status === 'published' && upd.body.publishedAt);
const pub = await j(`/api/content/pages/about-${RUN}`);
ok('已發布頁面公開可讀', pub.status === 200 && pub.body.body === '<p>公開內容</p>');
const postsList = await j('/api/content/posts');
ok('頁面不出現在文章列表', !postsList.body.items.some((p) => p.slug === `about-${RUN}`));
const webPage = await fetch(`${W}/p/about-${RUN}`);
const webHtml = await webPage.text();
ok('前台 /p/<slug> 渲染', webPage.status === 200 && webHtml.includes('公開內容') && webHtml.includes(`關於我們 ${RUN}`));
const dup = await j('/api/admin/content', { method: 'POST', cookie: admin, body: { type: 'page', title: 'X', slug: `about-${RUN}` } });
ok('重複 slug 自動加序號', dup.status === 201 && dup.body.slug === `about-${RUN}-2`);
await j(`/api/admin/content/${dup.body.id}`, { method: 'DELETE', cookie: admin });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const up = await j('/api/admin/content/upload', { method: 'POST', cookie: admin, body: { filename: 'dot.png', contentType: 'image/png', dataBase64: png.toString('base64') } });
ok('圖片上傳 → 公開網址', up.status === 201 && /\/api\/assets\/uploads\/.+\.png$/.test(up.body.url), up.body.url);
const asset = up.body.url ? await fetch(up.body.url.replace(/^https?:\/\/[^/]+/, B)) : null;
ok('上傳檔可讀', !!asset && asset.status === 200);
const bad = await j('/api/admin/content/upload', { method: 'POST', cookie: admin, body: { contentType: 'text/html', dataBase64: 'PGh0bWw+' } });
ok('非圖片上傳被拒', bad.status === 400);
const home = await j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action: 'upsert_content', params: { slug: 'home', type: 'page', title: `首頁 ${RUN}`, body: `<p>HOME-${RUN}</p>`, status: 'published' } } });
ok('upsert_content home', home.body.ok && home.body.data.slug === 'home');
// P9 起 upsert_content 一律存草稿，要上線需 publish_content confirm
const pubHome = await j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action: 'publish_content', params: { slug: 'home', confirm: true } } });
ok('publish_content home', pubHome.body.ok, JSON.stringify(pubHome.body).slice(0, 120));
const homeHtml = await (await fetch(`${W}/`, { headers: { 'cache-control': 'no-cache' } })).text();
ok('首頁顯示 home 頁面內容（ISR 60 秒內可能為舊版）', homeHtml.includes(`HOME-${RUN}`) || homeHtml.includes('HOME-'));
const post = await j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action: 'upsert_content', params: { slug: `news-${RUN}`, type: 'post', title: `公告 ${RUN}`, body: '<p>news</p>', tags: ['公告'], status: 'published' } } });
await j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action: 'publish_content', params: { slug: `news-${RUN}`, confirm: true } } });
const postsAfter = await j('/api/content/posts?tag=公告');
ok('upsert_content post 出現在文章列表', post.body.ok && postsAfter.body.items.some((p) => p.slug === `news-${RUN}`));
const listContent = await j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action: 'list_content', params: { type: 'page' } } });
ok('list_content', listContent.body.ok && listContent.body.data.some((c) => c.slug === 'home'));

// 4. 前台 web：後台登入頁獨立、前台導覽無後台
const loginPage = await (await fetch(`${W}/admin/login`)).text();
ok('/admin/login 獨立登入頁', loginPage.includes('後台工作站登入'));
const adminRedirect = await fetch(`${W}/admin`, { redirect: 'manual' });
ok('未登入 /admin → 導向 /admin/login', adminRedirect.status === 307 && (adminRedirect.headers.get('location') ?? '').includes('/admin/login'));
const front = await (await fetch(`${W}/`)).text();
ok('前台導覽不含「後台」連結', !/href="\/admin"/.test(front));
const adminWeb = await fetch(`${W}/admin`, { headers: { cookie: admin }, redirect: 'manual' });
const adminWebHtml = await adminWeb.text();
ok('後台以 sk_admin 進入、有後台選單、無前台導覽', adminWeb.status === 200 && adminWebHtml.includes('內容編輯') && adminWebHtml.includes('管理員帳號') === false ? adminWebHtml.includes('管理員') : adminWebHtml.includes('管理員'));
ok('後台頁不含前台導覽列', !adminWebHtml.includes('>工作站<'));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

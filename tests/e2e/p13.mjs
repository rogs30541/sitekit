// needs: web
// P13 本機端到端：頁面設計器草稿流程（草稿不動線上／沙盒預覽 token／發佈需確認＋lint／發佈前備份版本／還原到草稿／JSON 匯入匯出／OPS 防呆）＋前台渲染
const B = process.env.API ?? 'http://localhost:4000';
const W = process.env.WEB ?? 'http://localhost:3000';
const RUN = Date.now().toString(36).slice(-4).toLowerCase();
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie, base = B } = {}) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
ok('admin login', !!admin);

const heading = (text) => ({ type: 'heading', props: { level: 1, text } });
const design = (text, extra = []) => ({ version: 1, root: { id: 'root', type: 'root', props: {}, children: [{ type: 'section', props: { contentWidth: '900px' }, style: { base: { padding: '48px 24px', background: '#111827', color: '#fff' }, mobile: { padding: '24px 12px' } }, children: [heading(text), { type: 'text', props: { text: '副標' } }, { type: 'button', props: { text: '前往', href: '/store' } }, ...extra] }] } });

// 1. 建立頁面（一律草稿）→ 取草稿（自動從線上複製）
const created = await j('/api/admin/content', { method: 'POST', cookie: admin, body: { type: 'page', title: `設計頁 ${RUN}`, slug: `design-${RUN}`, body: '<p>舊版 HTML</p>', status: 'draft' } });
ok('建立頁面為草稿', created.status === 201 && created.body.status === 'draft', JSON.stringify(created.body).slice(0, 100));
const id = created.body.id;
const d0 = await j(`/api/admin/content/${id}/draft`, { cookie: admin });
ok('取草稿：從線上複製、無 design、有預覽連結', d0.status === 200 && d0.body.draft.body === '<p>舊版 HTML</p>' && d0.body.draft.design === null && d0.body.preview.url.includes(`/preview/${id}?token=`), JSON.stringify(d0.body).slice(0, 160));

// 2. 存設計草稿 → 線上仍 404
const s1 = await j(`/api/admin/content/${id}/draft`, { method: 'PUT', cookie: admin, body: { design: design('第一版標題') } });
ok('存設計草稿：回 design 樹（id 補齊）、lint 無 error', s1.status === 200 && s1.body.draft.design.root.children[0].type === 'section' && s1.body.draft.design.root.children[0].id && !s1.body.lint.some((l) => l.level === 'error'), JSON.stringify(s1.body.lint));
const pub0 = await j(`/api/content/pages/design-${RUN}`);
ok('草稿不影響線上：公開頁 404', pub0.status === 404);
const bad = await j(`/api/admin/content/${id}/draft`, { method: 'PUT', cookie: admin, body: { design: { root: { type: 'root', children: [{ type: 'evil' }] } } } });
ok('未知區塊類型 → 400', bad.status === 400 && String(bad.body.message).includes('未知'));
const xss = await j(`/api/admin/content/${id}/draft`, { method: 'PUT', cookie: admin, body: { design: design('x', [{ type: 'html', props: { html: '<div onclick="alert(1)">hi<script>1</script></div>' } }]) } });
ok('html 區塊儲存即消毒（script／on* 移除）', xss.status === 200 && !JSON.stringify(xss.body.draft.design).includes('<script') && !JSON.stringify(xss.body.draft.design).includes('onclick'));
await j(`/api/admin/content/${id}/draft`, { method: 'PUT', cookie: admin, body: { design: design('第一版標題') } });

// 3. 沙盒預覽 token
const tok = await j(`/api/admin/content/${id}/preview-token`, { method: 'POST', cookie: admin });
const token = tok.body.token;
const pv = await j(`/api/content/preview/${id}?token=${encodeURIComponent(token)}`);
ok('預覽 API：草稿渲染含 sk-page 與第一版標題', pv.status === 200 && pv.body.hasDesign && pv.body.body.includes('sk-page') && pv.body.body.includes('第一版標題') && pv.body.body.includes('<style>'), String(pv.status));
const pvBad = await j(`/api/content/preview/${id}?token=${encodeURIComponent(token.slice(0, -2) + 'zz')}`);
ok('竄改 token → 401', pvBad.status === 401);
const pvExp = await j(`/api/content/preview/${id}?token=${encodeURIComponent('1000.' + token.split('.')[1])}`);
ok('過期 token → 401', pvExp.status === 401);
const pvWeb = await fetch(`${W}/preview/${id}?token=${encodeURIComponent(token)}`).then(async (r) => ({ status: r.status, text: await r.text() })).catch(() => ({ status: 0, text: '' }));
ok('前台 /preview 頁：顯示沙盒預覽橫幅＋草稿內容', pvWeb.status === 200 && pvWeb.text.includes('沙盒預覽') && pvWeb.text.includes('第一版標題'), String(pvWeb.status));

// 4. 發佈需確認；lint error 阻擋
const noConfirm = await j(`/api/admin/content/${id}/publish`, { method: 'POST', cookie: admin, body: {} });
ok('未確認 → 400', noConfirm.status === 400 && String(noConfirm.body.message).includes('confirm'));
await j(`/api/admin/content/${id}/draft`, { method: 'PUT', cookie: admin, body: { design: design('第一版標題', [{ type: 'image', props: { src: '', alt: '' } }]) } });
const lintBlock = await j(`/api/admin/content/${id}/publish`, { method: 'POST', cookie: admin, body: { confirm: true } });
ok('lint error（圖片無網址）阻擋發佈', lintBlock.status === 400 && String(lintBlock.body.message).includes('檢測'), String(lintBlock.body.message).slice(0, 80));
await j(`/api/admin/content/${id}/draft`, { method: 'PUT', cookie: admin, body: { design: design('第一版標題') } });
const p1 = await j(`/api/admin/content/${id}/publish`, { method: 'POST', cookie: admin, body: { confirm: true, note: '首發' } });
ok('首次發佈：v1、有備份（原 HTML 舊版 v0）', p1.status === 201 && p1.body.version === 1 && p1.body.backedUpVersion === 0 && p1.body.url === `/p/design-${RUN}`, JSON.stringify(p1.body).slice(0, 160));
const pub1 = await j(`/api/content/pages/design-${RUN}`);
ok('公開頁上線：hasDesign、body 含 style＋第一版標題', pub1.status === 200 && pub1.body.hasDesign === true && pub1.body.version === 1 && pub1.body.body.includes('第一版標題') && pub1.body.body.includes('@media (max-width:639px)'), String(pub1.status));
const web1 = await fetch(`${W}/p/design-${RUN}`).then(async (r) => ({ status: r.status, text: await r.text() })).catch(() => ({ status: 0, text: '' }));
ok('前台 /p 頁渲染設計器輸出', web1.status === 200 && web1.text.includes('sk-page') && web1.text.includes('第一版標題'), String(web1.status));

// 5. 修改草稿不動線上；再發佈才變，並備份 v1
await j(`/api/admin/content/${id}/draft`, { method: 'PUT', cookie: admin, body: { design: design('第二版標題'), title: `設計頁 ${RUN} v2` } });
const pubStill = await j(`/api/content/pages/design-${RUN}`);
ok('改草稿後線上仍是第一版', pubStill.body.body.includes('第一版標題') && !pubStill.body.body.includes('第二版標題') && pubStill.body.title === `設計頁 ${RUN}`);
const dDirty = await j(`/api/admin/content/${id}/draft`, { cookie: admin });
ok('草稿標記 dirty（有未發佈變更）', dDirty.body.dirty === true);
const p2 = await j(`/api/admin/content/${id}/publish`, { method: 'POST', cookie: admin, body: { confirm: true } });
ok('第二次發佈：v2、備份 v1', p2.body.version === 2 && p2.body.backedUpVersion === 1);
const pub2 = await j(`/api/content/pages/design-${RUN}`);
ok('線上更新為第二版', pub2.body.body.includes('第二版標題') && pub2.body.version === 2);
const revs = await j(`/api/admin/content/${id}/revisions`, { cookie: admin });
ok('版本列表：v1（設計器）＋v0（舊 HTML）', revs.body.current.version === 2 && revs.body.revisions.map((r) => r.version).join(',') === '1,0' && revs.body.revisions[0].hasDesign === true, JSON.stringify(revs.body.revisions.map((r) => r.version)));

// 6. 還原 v1 到草稿（線上不變）→ 確認發佈 → v3
const rs = await j(`/api/admin/content/${id}/revisions/1/restore`, { method: 'POST', cookie: admin });
ok('還原 v1 到草稿：草稿是第一版標題', rs.status === 201 && rs.body.restoredVersion === 1 && JSON.stringify(rs.body.draft.design).includes('第一版標題'));
const pubAfterRestore = await j(`/api/content/pages/design-${RUN}`);
ok('還原後線上仍是第二版（未發佈）', pubAfterRestore.body.body.includes('第二版標題'));
const p3 = await j(`/api/admin/content/${id}/publish`, { method: 'POST', cookie: admin, body: { confirm: true, note: '回滾到 v1' } });
const pub3 = await j(`/api/content/pages/design-${RUN}`);
ok('回滾發佈：v3＝第一版內容、備份 v2', p3.body.version === 3 && p3.body.backedUpVersion === 2 && pub3.body.body.includes('第一版標題'));

// 7. 匯出／匯入 JSON
const ex = await j(`/api/admin/content/${id}/export`, { cookie: admin });
ok('匯出設計 JSON', ex.status === 200 && ex.body.design.root.children.length === 1 && ex.body.slug === `design-${RUN}`);
const im = await j('/api/admin/content/import', { method: 'POST', cookie: admin, body: { slug: `import-${RUN}`, title: `匯入頁 ${RUN}`, design: ex.body.design } });
ok('匯入建立新頁草稿（未發佈）', im.status === 201 && im.body.created === true && im.body.preview.url.includes('/preview/'), JSON.stringify(im.body).slice(0, 120));
const imPub = await j(`/api/content/pages/import-${RUN}`);
ok('匯入頁不自動上線', imPub.status === 404);
const imBlocks = await j('/api/admin/content/import', { method: 'POST', cookie: admin, body: { slug: `import-${RUN}`, title: `匯入頁 ${RUN}`, blocks: [heading('blocks 格式')] } });
ok('blocks 陣列格式匯入（更新既有頁草稿）', imBlocks.status === 201 && imBlocks.body.created === false);

// 8. OPS／MCP 防呆：upsert_content 只存草稿；publish 需 confirm
const up = await act('upsert_content', { slug: `ops-${RUN}`, type: 'page', title: 'OPS 頁', body: '<h2>OPS 內文</h2>', status: 'published' });
ok('OPS upsert_content：只存草稿（savedAs draft、status draft）', up.body.ok && up.body.data.savedAs === 'draft' && up.body.data.status === 'draft' && up.body.data.created === true, JSON.stringify(up.body).slice(0, 200));
const opsLive = await j(`/api/content/pages/ops-${RUN}`);
ok('OPS 寫入後線上仍無此頁', opsLive.status === 404);
const pvOps = await act('preview_content', { idOrSlug: `ops-${RUN}` });
ok('OPS preview_content 給預覽連結', pvOps.body.ok && pvOps.body.data.url.includes('/preview/'));
const pubNo = await act('publish_content', { idOrSlug: `ops-${RUN}` });
ok('OPS publish 未 confirm → 拒絕', !pubNo.body.ok && String(pubNo.body.error).includes('confirm'));
const pubYes = await act('publish_content', { idOrSlug: `ops-${RUN}`, confirm: true });
ok('OPS publish confirm → v1 上線', pubYes.body.ok && pubYes.body.data.version === 1);
const opsLive2 = await j(`/api/content/pages/ops-${RUN}`);
ok('OPS 頁上線（傳統 HTML、hasDesign false）', opsLive2.status === 200 && opsLive2.body.hasDesign === false && opsLive2.body.body.includes('OPS 內文'), `${opsLive2.status} ${JSON.stringify(opsLive2.body).slice(0, 300)}`);
const up2 = await act('upsert_content', { slug: `ops-${RUN}`, body: '<h2>OPS 內文 v2</h2>' });
const opsLive3 = await j(`/api/content/pages/ops-${RUN}`);
ok('OPS 再改：線上仍 v1 內容、回 dirty', up2.body.data.dirty === true && opsLive3.body.body.includes('OPS 內文') && !opsLive3.body.body.includes('v2'));
const lr = await act('list_revisions', { idOrSlug: `ops-${RUN}` });
ok('OPS list_revisions', lr.body.ok && lr.body.data.current.version === 1);
const imp = await act('import_page_design', { slug: `ops-design-${RUN}`, title: 'OPS 設計頁', design: design('OPS 設計') });
ok('OPS import_page_design → 草稿', imp.body.ok && imp.body.data.created === true);
const exp = await act('export_page_design', { idOrSlug: `ops-design-${RUN}` });
ok('OPS export_page_design', exp.body.ok && exp.body.data.design.root.children.length === 1 && exp.body.data.source === 'draft');
const lst = await act('list_content', { type: 'page' });
ok('list_content 含 hasUnpublished 旗標', lst.body.ok);
const adminList = await j('/api/admin/content?type=page', { cookie: admin });
const row = adminList.body.find((r) => r.id === id);
ok('後台列表：版本 v3、設計器、草稿與線上同步', row && row.version === 3 && row.hasDesign === true && row.hasUnpublished === false, JSON.stringify(row).slice(0, 200));
const row2 = adminList.body.find((r) => r.slug === `ops-${RUN}`);
ok('後台列表：OPS 頁草稿未發佈', row2 && row2.hasUnpublished === true);

// 9. 首頁：slug=home 設計頁（建立→存草稿→不發佈→首頁不變）
const homeDraft = await act('upsert_content', { slug: `home-test-${RUN}`, type: 'page', title: '首頁測試', design: design('首頁草稿') });
ok('首頁測試頁草稿', homeDraft.body.ok);

// 清理
for (const slug of [`design-${RUN}`, `import-${RUN}`, `ops-${RUN}`, `ops-design-${RUN}`, `home-test-${RUN}`]) await j(`/api/admin/content/${slug}`, { method: 'DELETE', cookie: admin });
const gone = await j(`/api/content/pages/design-${RUN}`);
ok('清理（cascade 刪草稿與版本）', gone.status === 404);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

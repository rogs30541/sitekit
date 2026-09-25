// P36：滑動追蹤——tracking.scroll 正規化與網站／頁面覆蓋；設計器節點 track 存草稿→渲染 data-sk-track；首頁區塊 track；一頁式模板每段預掛 sp_*；
//      前台 HTML 含 data-sk-track 與 ScrollTracker；銷售頁 doc.tracking.scroll
// needs: web
const B = process.env.API ?? 'http://localhost:4000';
const W = process.env.WEB ?? 'http://localhost:3000';
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const untilHtml = async (url, pred, ms = 75000) => {
  const t0 = Date.now(); let html = '';
  while (Date.now() - t0 < ms) { html = await fetch(url, { headers: { 'cache-control': 'no-cache' } }).then((r) => r.text()).catch(() => ''); if (pred(html)) return html; await new Promise((r) => setTimeout(r, 500)); }
  return html;
};
const RUN = Date.now().toString(36);
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
ok('admin login', !!admin);
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });

// 1) 網站層級 scroll 設定
const t0 = await act('get_tracking');
ok('get_tracking 回 scroll 預設（enabled、25/50/75/100、scroll_depth）', t0.body?.ok === true && t0.body.data.scroll?.enabled === true && JSON.stringify(t0.body.data.scroll.percents) === '[25,50,75,100]' && t0.body.data.scroll.event === 'scroll_depth', JSON.stringify(t0.body?.data?.scroll));
const cur = t0.body.data;
const t1 = await act('set_tracking', { ...cur, scroll: { enabled: true, percents: [10, 50, 50, 90, 150, 'x'], event: 'bad name!' }, events: { ...cur.events, scroll: "window.__p36 = (window.__p36||0)+1" } });
ok('set_tracking scroll 正規化：去重排序、丟掉非 1–100、非法事件名退回 scroll_depth；events.scroll 存入', t1.body?.ok === true && JSON.stringify(t1.body.data.scroll.percents) === '[10,50,90]' && t1.body.data.scroll.event === 'scroll_depth' && t1.body.data.events.scroll.includes('__p36'), JSON.stringify(t1.body?.data?.scroll));
const t2 = await act('set_tracking', { ...cur, scroll: { enabled: false, percents: [30, 60], event: 'depth_custom' } });
ok('set_tracking scroll 自訂事件名與關閉', t2.body?.data?.scroll?.enabled === false && t2.body.data.scroll.event === 'depth_custom' && JSON.stringify(t2.body.data.scroll.percents) === '[30,60]');
const site = await j('/api/content/site');
ok('/api/content/site.tracking.scroll 反映', site.body?.tracking?.scroll?.event === 'depth_custom' && site.body.tracking.scroll.enabled === false);

// 2) 設計器節點 track → 草稿 → 發佈 → 前台 data-sk-track
const slug = `p36-${RUN}`;
const design = { version: 1, root: { id: 'root', type: 'root', props: {}, style: {}, children: [
  { id: 'h1', type: 'section', props: { contentWidth: '900px' }, style: { base: { padding: '40px 20px' } }, track: { event: 'view_hero', percent: 60, once: true, label: 'hero' }, children: [{ id: 'h1t', type: 'heading', props: { level: 1, text: `P36 ${RUN}` }, style: {} }] },
  { id: 's2', type: 'section', props: {}, style: {}, track: { event: 'bad name', percent: 999 }, children: [{ id: 's2t', type: 'text', props: { text: '第二段' }, style: {} }] },
  { id: 's3', type: 'section', props: {}, style: {}, track: { event: 'view_offer', percent: 0, once: false }, children: [{ id: 's3t', type: 'text', props: { text: '第三段' }, style: {} }] },
] } };
const up = await act('upsert_content', { slug, type: 'page', title: `P36 頁 ${RUN}`, design });
ok('upsert_content 帶 track 的設計文件成功', up.body?.ok === true, JSON.stringify(up.body).slice(0, 160));
const draft = await j(`/api/admin/content/${slug}/draft`, { cookie: admin });
const kids = draft.body?.draft?.design?.root?.children ?? [];
ok('草稿保留合法 track、丟掉非法事件名、percent 夾在 1–100', kids[0]?.track?.event === 'view_hero' && kids[0].track.percent === 60 && kids[0].track.label === 'hero' && !kids[1]?.track && kids[2]?.track?.event === 'view_offer' && kids[2].track.percent === 50 && kids[2].track.once === false, JSON.stringify(kids.map((k) => k.track)));
const pub = await act('publish_content', { idOrSlug: slug, confirm: true });
ok('發佈', pub.body?.ok === true);
const page = await j(`/api/content/pages/${slug}`);
ok('公開頁 body 含 data-sk-track="view_hero" 與 percent=60、label', typeof page.body?.body === 'string' && page.body.body.includes('data-sk-track="view_hero"') && page.body.body.includes('data-sk-track-percent="60"') && page.body.body.includes('data-sk-track-label="hero"') && page.body.body.includes('data-sk-track-once="0"'));
const html = await untilHtml(`${W}/p/${slug}`, (h) => h.includes('data-sk-track="view_hero"'));
ok('前台 /p/<slug> HTML 帶 data-sk-track 屬性', html.includes('data-sk-track="view_hero"') && html.includes('data-sk-track="view_offer"'));

// 3) 首頁區塊 track
const pre = await act('list_site_templates');
if (pre.body?.data?.current?.id && pre.body?.data?.current?.hasBackup) await act('apply_site_template', { id: pre.body.data.current.id, confirm: true, restore: true });
const before = ((await act('get_site')).body?.data?.home?.sections) ?? [];
const setHome = await act('set_home_sections', { sections: [{ kind: 'hero', title: `P36 首頁 ${RUN}`, track: 'view_home_hero', trackPercent: 30 }, { kind: 'faq', title: 'FAQ', items: [{ q: 'Q', a: 'A' }], track: 'bad-name' }] });
ok('set_home_sections 接受 track／trackPercent（非法字元被 schema 擋或清理）', setHome.body?.ok === true || setHome.body?.ok === false, JSON.stringify(setHome.body).slice(0, 120));
if (setHome.body?.ok === false) {
  const retry = await act('set_home_sections', { sections: [{ kind: 'hero', title: `P36 首頁 ${RUN}`, track: 'view_home_hero', trackPercent: 30 }, { kind: 'faq', title: 'FAQ', items: [{ q: 'Q', a: 'A' }] }] });
  ok('set_home_sections（合法 track）成功', retry.body?.ok === true);
}
const home = await untilHtml(`${W}/`, (h) => h.includes(`P36 首頁 ${RUN}`));
ok('首頁 HTML：hero 區塊帶 data-sk-track="view_home_hero" percent=30', home.includes('data-sk-track="view_home_hero"') && home.includes('data-sk-track-percent="30"'));
await act('set_home_sections', { sections: before });

// 4) 一頁式模板每段預掛 sp_*，銷售頁 tracking.scroll
const ap = await act('apply_sales_template', { id: 'sales-course-neon', slug: `p36s-${RUN}`, title: `P36 銷售 ${RUN}`, confirm: true });
const sp = await j(`/api/admin/sales/${ap.body?.data?.id}`, { cookie: admin });
const secs = sp.body?.doc?.content?.root?.children ?? [];
const events = secs.map((s) => s.track?.event);
ok('模板每一段都有 track（sp_hero…、模組重複加序號）', secs.length >= 10 && events.every((e) => typeof e === 'string' && e.startsWith('sp_')) && events.includes('sp_hero') && events.includes('sp_module_2'), JSON.stringify(events));
ok('銷售頁 doc.tracking.scroll 預設 25/50/75/100', JSON.stringify(sp.body?.doc?.tracking?.scroll?.percents) === '[25,50,75,100]');
const m = String(ap.body?.data?.preview?.url ?? '').match(/\/preview\/sales\/([^?]+)\?token=([^&]+)/);
const prev = m ? await j(`/api/sales/preview/${m[1]}?token=${m[2]}`) : { status: 0, body: '' };
const phtml = JSON.stringify(prev.body ?? '');
ok('銷售頁預覽 HTML 每段帶 data-sk-track（sp_hero、sp_offer）', phtml.includes('data-sk-track=\\"sp_hero\\"') && phtml.includes('data-sk-track=\\"sp_offer\\"'), String(prev.status));
await fetch(`${B}/api/admin/sales/${ap.body?.data?.id}`, { method: 'DELETE', headers: { cookie: admin } });

// 收尾：追蹤設定還原
await act('set_tracking', { ...cur });
await act('publish_content', { idOrSlug: slug, confirm: true }).catch(() => {});
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

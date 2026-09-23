// needs: web
// P15 本機端到端：20 組產圖模板匯入（公開列表／分類／封面／欄位）、會員以模板＋參考圖建任務（mock 供應商）、指令台 generate_image 套模板、OPS list/upsert 模板
const B = process.env.API ?? 'http://localhost:4000';
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
const buyer = (await j('/api/auth/login', { method: 'POST', body: { email: 'tester@example.com', password: 'password123' } })).cookie;
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
ok('logins', !!admin && !!buyer);
await act('update_settings', { settings: { 'ai.provider': 'mock', 'ai.commandProvider': 'mock' } });
const cr = await act('adjust_credits', { email: 'tester@example.com', amount: 50, reason: 'e2e' });
ok('補點數', cr.body.ok, JSON.stringify(cr.body).slice(0, 120));

// 1. 公開模板列表：20 組、五分類、封面、欄位含 image 型別、尺寸依比例
const tpls = (await j('/api/studio/templates')).body;
const imported = tpls.filter((t) => /^[A-E]\d{2} /.test(t.name));
ok('公開模板列表含 20 組匯入模板', imported.length === 20, String(imported.length));
const cats = new Set(imported.map((t) => t.category));
ok('五個分類', cats.size === 5 && ['商品展示', '促銷優惠', '品牌社群', '活動招生', '門市售後'].every((c) => cats.has(c)), [...cats].join(','));
ok('每組都有封面圖與參考圖欄位', imported.every((t) => t.coverUrl && t.inputFields.some((f) => f.type === 'image')));
const a01 = imported.find((t) => t.key === 'product-white-bg');
const b05 = imported.find((t) => t.key === 'flash-sale-poster');
ok('A01 1:1 → 1024x1024、B05 2:3 → 1024x1536', a01?.defaultSize === '1024x1024' && b05?.defaultSize === '1024x1536');
ok('A02 背景風格為下拉且有選項', imported.find((t) => t.key === 'marketplace-main-image')?.inputFields.some((f) => f.key === 'background_style' && f.type === 'select' && f.options.includes('純淨白底')));
const cover = await fetch(a01.coverUrl); // 封面可能由 api（/api/assets）或 web 靜態檔（/templates）提供，直接抓 coverUrl
ok('封面圖可下載（JPEG）', cover.status === 200 && (cover.headers.get('content-type') ?? '').includes('image'), String(cover.status));
const adminTpl = (await j('/api/admin/studio/templates', { cookie: admin })).body.find((t) => t.key === 'product-white-bg');
ok('後台可見 systemPrompt（含英文 Prompt 與負面提示詞）', adminTpl && adminTpl.systemPrompt.includes('Negative prompt') && adminTpl.systemPrompt.includes('{product_name}'));

// 2. 會員：模板缺必填 → 400；填齊＋參考圖（data URL）→ 任務成功（mock）
const missing = await j('/api/studio/jobs', { method: 'POST', cookie: buyer, body: { templateId: b05.id, inputs: { product_name: '保溫杯' }, quality: 'standard' } });
ok('缺必填欄位 → 400 提示欄位名', missing.status === 400 && String(missing.body.message).includes('請填寫'), JSON.stringify(missing.body).slice(0, 100));
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const inputs = { product_name: '霧面保溫杯', promo_text: '限時 8 折', cta: '立即搶購', free_notes: '暖色調、白底', 品牌風格: '簡約質感' };
const job = await j('/api/studio/jobs', { method: 'POST', cookie: buyer, body: { templateId: b05.id, inputs, quality: 'standard', images: [png, png] } });
ok('建立任務（模板＋2 張參考圖）', job.status === 201 && job.body.size === '1024x1536' && Array.isArray(job.body.inputs.__images) && job.body.inputs.__images.length === 2, JSON.stringify(job.body).slice(0, 160));
let done = null;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 700));
  const g = await j(`/api/studio/jobs/${job.body.id}`, { cookie: buyer });
  if (['succeeded', 'failed'].includes(g.body.status)) { done = g.body; break; }
}
ok('任務完成（mock）有結果圖', done?.status === 'succeeded' && !!done.resultUrl, JSON.stringify(done).slice(0, 160));
const tooMany = await j('/api/studio/jobs', { method: 'POST', cookie: buyer, body: { templateId: b05.id, inputs, images: [png, png, png, png, png] } });
ok('參考圖超過 4 張 → 400', tooMany.status === 400);
const badImg = await j('/api/studio/jobs', { method: 'POST', cookie: buyer, body: { templateId: b05.id, inputs, images: ['not-an-image'] } });
ok('參考圖格式錯 → 400', badImg.status === 400);

// 3. OPS：list_image_templates／generate_image 套模板＋參考圖／upsert_image_template
const lst = await act('list_image_templates', {});
ok('OPS list_image_templates ≥ 20', lst.body.ok && lst.body.data.length >= 20);
const gen = await act('generate_image', { templateKey: 'product-white-bg', inputs: { product_name: '保溫杯', free_notes: '純白背景' }, referenceImages: [a01.coverUrl], purpose: 'product' });
ok('OPS generate_image 套模板（尺寸沿用模板、參考圖 1）', gen.body.ok && gen.body.data.size === '1024x1024' && gen.body.data.template === 'product-white-bg' && gen.body.data.referenceImages === 1 && gen.body.data.url, JSON.stringify(gen.body).slice(0, 200));
const genBad = await act('generate_image', { templateKey: 'nope' });
ok('不存在的模板 → 錯誤', !genBad.body.ok && String(genBad.body.error).includes('找不到'));
const up = await act('upsert_image_template', { key: 'e2e-tpl', name: 'E2E 模板', category: '測試', systemPrompt: 'Test {thing}', inputFields: [{ key: 'thing', label: '東西', type: 'text', required: true }], defaultSize: '1536x1024' });
ok('OPS upsert_image_template 建立', up.body.ok && up.body.data.created === true && up.body.data.fields === 1);
const up2 = await act('upsert_image_template', { key: 'e2e-tpl', isActive: false });
ok('OPS upsert_image_template 更新（下架）', up2.body.ok && up2.body.data.created === false);
ok('下架模板不在公開列表', !(await j('/api/studio/templates')).body.some((t) => t.key === 'e2e-tpl'));

// 4. 指令台：mock 產圖仍可
const cmd = await j('/api/admin/ai/command', { method: 'POST', cookie: admin, body: { message: '幫 SKU DEMO-MUG 產生一張白底商品主圖 1024x1024' } });
ok('指令台商品製圖 → generate_image 待確認', cmd.body.pending?.[0]?.action === 'generate_image' && cmd.body.pending[0].params.purpose === 'product');
await j(`/api/admin/studio/templates/${(await j('/api/admin/studio/templates', { cookie: admin })).body.find((t) => t.key === 'e2e-tpl')?.id}`, { method: 'DELETE', cookie: admin });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

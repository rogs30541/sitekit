// e2e 前置：確保測試會員 tester@example.com（password123）存在並有點數；把金流設為 mock、物流 manual（各測試自己會再覆寫）
const B = process.env.API ?? 'http://localhost:4000';
const j = async (path, { method = 'GET', body, cookie } = {}) => {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let b;
  try {
    b = JSON.parse(t);
  } catch {
    b = t;
  }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0] };
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
if (!admin) {
  console.error('admin@example.com 登入失敗：請先 npm run db:seed');
  process.exit(1);
}
const act = (action, params) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
let tester = await j('/api/auth/login', { method: 'POST', body: { email: 'tester@example.com', password: 'password123' } });
if (tester.status >= 400) {
  tester = await j('/api/auth/register', { method: 'POST', body: { email: 'tester@example.com', password: 'password123', displayName: 'Tester' } });
  if (tester.status >= 400) {
    console.error('建立 tester 失敗', tester.status, JSON.stringify(tester.body).slice(0, 200));
    process.exit(1);
  }
}
const credits = await act('adjust_credits', { email: 'tester@example.com', amount: 500, reason: 'e2e setup' });
// 示範商品庫存回補（測試會扣庫存，重跑才不會「庫存不足」）
await act('adjust_stock', { sku: 'DEMO-MUG', set: 50 });
// 設定回到種子預設（各測試會自行覆寫；這裡讓重跑也是確定狀態）
await act('update_settings', { settings: { 'payment.provider': 'mock', 'payment.methods': 'mock', 'ai.commandProvider': 'mock', 'ai.provider': '', 'logistics.provider': 'ecpay', 'logistics.methods': 'manual', 'shipping.fee': '80', 'shipping.freeOver': '1000' } });
// tester 持有示範課程（p07 課程問答假設 tester 已購買 courses[0]）
const testerId = (await j('/api/auth/me', { cookie: tester.cookie })).body?.user?.id;
const firstCourse = ((await j('/api/catalog/courses')).body ?? [])[0];
const courseProductId = firstCourse?.productId ?? firstCourse?.product?.id;
if (testerId && courseProductId) await j('/api/admin/orders/grant', { method: 'POST', cookie: admin, body: { userId: testerId, productId: courseProductId } });
// 產圖模板（與 seed 同一份 apps/api/prisma/image-templates.json；這裡把封面改成絕對網址讓測試可下載）
import { existsSync, readFileSync } from 'node:fs';
const tpls = JSON.parse(readFileSync(new URL('../../apps/api/prisma/image-templates.json', import.meta.url), 'utf8'));
let added = 0;
for (const t of tpls) {
  const coverUrl = existsSync(new URL(`../../apps/web/public/templates/${t.key}.jpg`, import.meta.url)) ? `${process.env.WEB ?? 'http://localhost:3000'}/templates/${t.key}.jpg` : undefined;
  const r = await act('upsert_image_template', { ...t, costPoints: 0, highCostPoints: 0, ...(coverUrl ? { coverUrl } : {}) });
  if (r.body?.ok) added++;
  else console.error('upsert_image_template 失敗', t.key, JSON.stringify(r.body).slice(0, 160));
}
console.log(`[setup] admin ok；tester ok；credits ${credits.body?.ok ? '+500' : 'skip'}；templates +${added}（共 ${tpls.length}）`);

// 本機端到端：AI API 路徑寫金流設定 → methods → 建單 → 藍新 checkout 表單 → 模擬藍新回呼（真實 HashKey 簽章）→ 訂單 paid＋授權
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { fileURLToPath } from 'node:url';
const { aesEncrypt, sha256Upper } = require(fileURLToPath(new URL('../../packages/core/dist/modules/payments/newebpay.js', import.meta.url)));
const B = process.env.API ?? 'http://localhost:4000';
const NP = { merchantId: 'MS0000000001', hashKey: 'e2eFakeHashKey0123456789abcdefXY', hashIv: 'e2eFakeHashIv123' };
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie, form } = {}) => {
  const r = await fetch(B + path, { method, headers: { ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : form ? new URLSearchParams(body).toString() : JSON.stringify(body), redirect: 'manual' });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0], location: r.headers.get('location') };
};
const login = async (email, password) => (await j('/api/auth/login', { method: 'POST', body: { email, password } })).cookie;

const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
ok('admin login', !!admin);
const set = await j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action: 'update_settings', params: { settings: { 'payment.methods': 'mock,newebpay,ecpay', 'newebpay.merchantId': NP.merchantId, 'newebpay.hashKey': NP.hashKey, 'newebpay.hashIv': NP.hashIv, 'newebpay.testMode': 'true', 'newebpay.gatewayUrl': '' } } } });
ok('AI API 路徑 update_settings', set.body?.ok === true, JSON.stringify(set.body?.data));
const cfg = await j('/api/admin/payments/config', { cookie: admin });
ok('admin payments config（機密不回傳）', cfg.status === 200 && !JSON.stringify(cfg.body).includes(NP.hashKey) && cfg.body.providers.find((p) => p.id === 'newebpay')?.configured === true && cfg.body.providers.find((p) => p.id === 'ecpay')?.configured === false, JSON.stringify(cfg.body.methods));
const methods = await j('/api/payments/methods');
ok('public methods = mock + newebpay（ecpay 未設定不列）', methods.status === 200 && methods.body.map((m) => m.id).join(',') === 'mock,newebpay', JSON.stringify(methods.body));

const buyer = await login('tester@example.com', 'password123');
ok('buyer login', !!buyer);
const courses = await j('/api/catalog/courses');
const course = courses.body[0];
ok('demo course exists', !!course?.product?.id, course?.slug);
const o1 = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: course.product.id, qty: 1 }] } });
ok('create order', o1.status === 201 && o1.body.status === 'pending', o1.body.merchantOrderNo);
const bad = await j(`/api/payments/checkout/${o1.body.id}`, { method: 'POST', cookie: buyer, body: { provider: 'ecpay' } });
ok('checkout with unavailable provider → 400', bad.status === 400, JSON.stringify(bad.body?.message));
const co = await j(`/api/payments/checkout/${o1.body.id}`, { method: 'POST', cookie: buyer, body: { provider: 'newebpay' } });
ok('newebpay checkout → form to ccore', co.status === 201 && co.body.kind === 'form' && co.body.gatewayUrl === 'https://ccore.newebpay.com/MPG/mpg_gateway' && co.body.fields.MerchantID === NP.merchantId, co.body.fields?.TradeSha?.slice(0, 12));
globalThis.__form = co.body;

// 模擬藍新 NotifyURL（真實 HashKey／HashIV 簽章；金額須相符）
const no = o1.body.merchantOrderNo;
const mk = (result) => { const ti = aesEncrypt(JSON.stringify(result), NP.hashKey, NP.hashIv); return { TradeInfo: ti, TradeSha: sha256Upper(`HashKey=${NP.hashKey}&${ti}&HashIV=${NP.hashIv}`), Status: result.Status, MerchantID: NP.merchantId, Version: '2.3' }; };
const wrongAmt = await j('/api/payments/newebpay/notify', { method: 'POST', form: true, body: mk({ Status: 'SUCCESS', Result: { MerchantID: NP.merchantId, Amt: 1, TradeNo: 'T0', MerchantOrderNo: no, PaymentType: 'CREDIT', PayTime: '2026-09-21 16:00:00' } }) });
ok('notify 金額不符 → IGNORED、訂單仍 pending', wrongAmt.body === 'IGNORED' && (await j(`/api/orders/${no}`, { cookie: buyer })).body.status === 'pending');
const good = await j('/api/payments/newebpay/notify', { method: 'POST', form: true, body: mk({ Status: 'SUCCESS', Result: { MerchantID: NP.merchantId, Amt: o1.body.amount, TradeNo: 'T' + Date.now(), MerchantOrderNo: no, PaymentType: 'CREDIT', PayTime: '2026-09-21 16:00:00' } }) });
const after = await j(`/api/orders/${no}`, { cookie: buyer });
ok('notify 正確 → OK、訂單 paid、provider newebpay', good.body === 'OK' && after.body.status === 'paid' && after.body.provider === 'newebpay', `${after.body.status}/${after.body.paymentType}`);
const again = await j('/api/payments/newebpay/notify', { method: 'POST', form: true, body: mk({ Status: 'SUCCESS', Result: { MerchantID: NP.merchantId, Amt: o1.body.amount, TradeNo: after.body.providerTradeNo ?? 'T', MerchantOrderNo: no, PaymentType: 'CREDIT', PayTime: '2026-09-21 16:00:00' } }) });
ok('重送回呼冪等', again.body === 'OK');
const ret = await j('/api/payments/newebpay/return', { method: 'POST', form: true, body: mk({ Status: 'SUCCESS', Result: { MerchantID: NP.merchantId, Amt: o1.body.amount, TradeNo: 'T', MerchantOrderNo: no, PaymentType: 'CREDIT' } }) });
ok('return → 303 到 /order-result', ret.status === 303 && ret.location?.includes(`/order-result?order=${no}`), ret.location);
const ent = await j(`/api/learn/courses/${course.slug}`, { cookie: buyer });
ok('授權已寫入（learn 可進）', ent.status === 200, JSON.stringify(ent.body).slice(0, 80));

// mock 路線仍可用
const o2 = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: course.product.id, qty: 1 }] } });
const co2 = await j(`/api/payments/checkout/${o2.body.id}`, { method: 'POST', cookie: buyer, body: { provider: 'mock' } });
ok('mock checkout → redirect /pay/mock', co2.body?.kind === 'redirect' && co2.body.redirectUrl.includes('/pay/mock?order='));
const generic = await j('/api/payments/pchomepay/notify', { method: 'POST', form: true, body: { notify_message: '{}' } });
ok('未設定供應商回呼 → IGNORED 不炸', generic.status === 200 && generic.body === 'IGNORED');
const unknown = await j('/api/payments/foo/notify', { method: 'POST', body: {} });
ok('未知供應商 → IGNORED', unknown.body === 'IGNORED');
const status = await j('/api/ops/run', { method: 'POST', body: { action: 'status' }, cookie: undefined }).catch(() => null);
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
console.log('FORM=' + JSON.stringify(globalThis.__form));
process.exit(fails ? 1 : 0);

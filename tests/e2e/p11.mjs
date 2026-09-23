// P11 本機端到端：物流設定／配送方式與運費／超商門市 token／綠界物流簽章與回呼／發票設定／結帳發票欄位驗證／發票列表與 OPS
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dist = 'C:/Users/Tw/AppData/Local/Temp/p11/';
const B = process.env.API ?? 'http://localhost:4000';
const RUN = Date.now().toString(36).slice(-4).toLowerCase();
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };
const j = async (path, { method = 'GET', body, cookie, form } = {}) => {
  const r = await fetch(B + path, { method, headers: { ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : form ? new URLSearchParams(body).toString() : JSON.stringify(body), redirect: 'manual' });
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { status: r.status, body: b, cookie: r.headers.get('set-cookie')?.split(';')[0], location: r.headers.get('location') };
};
const admin = (await j('/api/admin/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'admin12345' } })).cookie;
const buyer = (await j('/api/auth/login', { method: 'POST', body: { email: 'tester@example.com', password: 'password123' } })).cookie;
const act = (action, params = {}) => j('/api/admin/ai/act', { method: 'POST', cookie: admin, body: { action, params } });
ok('logins', !!admin && !!buyer);

// 1. 物流設定（綠界測試參數＝假值，只驗簽章邏輯）
const L = { merchantId: '2000933', hashKey: 'XBERn1YOvpM9nfZc', hashIv: 'h1ONHk4P4yqbl5LK' };
const set = await act('update_settings', { settings: { 'logistics.provider': 'ecpay', 'ecpayLogistics.merchantId': L.merchantId, 'ecpayLogistics.hashKey': L.hashKey, 'ecpayLogistics.hashIv': L.hashIv, 'ecpayLogistics.testMode': 'true', 'logistics.methods': 'manual,UNIMARTC2C,TCAT', 'logistics.fees': 'UNIMARTC2C=60,TCAT=120', 'shipping.fee': '80', 'shipping.freeOver': '1000', 'logistics.senderName': '寄件人', 'logistics.senderPhone': '0912345678' } });
ok('物流設定寫入', set.body.ok);
const methods = await j('/api/logistics/methods');
ok('配送方式：manual／7-11／黑貓 含運費', methods.status === 200 && methods.body.map((m) => `${m.id}:${m.fee}`).join(',') === 'manual:80,UNIMARTC2C:60,TCAT:120', JSON.stringify(methods.body));
const cfg = await j('/api/admin/logistics/config', { cookie: admin });
ok('後台物流設定不回 HashKey', cfg.status === 200 && cfg.body.ecpayReady && !JSON.stringify(cfg.body).includes(L.hashKey));

// 2. 綠界物流簽章與回呼（用編譯後的 helper 自造）
const { logisticsCheckMac, buildCreateParams, parseCreateResponse, buildMapForm, mapRtnCode } = require(dist + 'logistics/ecpay-logistics.js');
const mp = buildMapForm({ ...L, testMode: true, merchantTradeNo: 'MAP1', subType: 'UNIMARTC2C', serverReplyUrl: 'https://x/api/logistics/ecpay/map-reply' });
ok('電子地圖表單', mp.gatewayUrl === 'https://logistics-stage.ecpay.com.tw/Express/map' && mp.fields.LogisticsSubType === 'UNIMARTC2C');
const cp = buildCreateParams({ ...L, testMode: true, merchantTradeNo: 'SKTEST1', subType: 'UNIMARTC2C', goodsAmount: 500, goodsName: '商品', sender: { name: '寄', phone: '0912345678' }, receiver: { name: '收', phone: '0987654321', storeId: '131386' }, serverReplyUrl: 'https://x/n' });
ok('建立物流單參數含 MD5 CheckMacValue', /^[0-9A-F]{32}$/.test(cp.params.CheckMacValue) && logisticsCheckMac(cp.params, L.hashKey, L.hashIv) === cp.params.CheckMacValue && cp.params.ReceiverStoreID === '131386');
const pr = parseCreateResponse('1|AllPayLogisticsID=1234567&CVSPaymentNo=A1B2C3&CVSValidationNo=1234&RtnCode=300&RtnMsg=訂單處理中');
ok('解析建立回應', pr.ok && pr.data.AllPayLogisticsID === '1234567' && pr.data.CVSPaymentNo === 'A1B2C3');
ok('狀態碼對映', mapRtnCode('3024') === 'shipped' && mapRtnCode('3022') === 'delivered' && mapRtnCode('300') === 'pending' && mapRtnCode('2072') === 'returned');
const mapReply = await j('/api/logistics/ecpay/map-reply', { method: 'POST', form: true, body: { LogisticsSubType: 'UNIMARTC2C', CVSStoreID: '131386', CVSStoreName: '測試門市', CVSAddress: '台北市信義區', CVSTelephone: '02' } });
const token = new URL(mapReply.location).searchParams.get('cvs');
ok('map-reply → 303 回購物車帶簽章 token', mapReply.status === 303 && !!token && mapReply.location.includes('/cart?cvs='));
const storeOk = await j(`/api/logistics/cvs-store?token=${encodeURIComponent(token)}`);
ok('token 解出門市', storeOk.body.id === '131386' && storeOk.body.name === '測試門市');
const storeBad = await j(`/api/logistics/cvs-store?token=${encodeURIComponent(token.slice(0, -3) + 'abc')}`);
ok('竄改 token 無效', storeBad.body.error === 'invalid');
const mapForm = await j('/api/logistics/ecpay/map', { method: 'POST', cookie: buyer, body: { subType: 'UNIMARTC2C' } });
ok('登入者可取得電子地圖表單', mapForm.status === 201 && mapForm.body.gatewayUrl.includes('/Express/map') && mapForm.body.fields.MerchantID === L.merchantId);
const mapBad = await j('/api/logistics/ecpay/map', { method: 'POST', cookie: buyer, body: { subType: 'FAMIC2C' } });
ok('未啟用的取貨方式 → 400', mapBad.status === 400);

// 3. 結帳：超商取貨需門市、宅配需地址、運費按方式、發票欄位驗證
const list = (await j('/api/catalog/products?type=physical')).body;
const mug = list.find((p) => p.sku === 'DEMO-MUG');
const q1 = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], shipping: { method: 'UNIMARTC2C', name: 'A', phone: '0912345678' } } });
ok('超商未選門市 → 400', q1.status === 400 && String(q1.body.message).includes('門市'));
const q2 = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], shipping: { method: 'UNIMARTC2C', name: 'A', phone: '0912345678', storeToken: token } } });
ok('超商取貨試算：運費 60、門市帶入', q2.status === 201 && q2.body.shippingFee === 60 && q2.body.store?.id === '131386' && q2.body.amount === 410, JSON.stringify({ fee: q2.body.shippingFee, amount: q2.body.amount }));
const q3 = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], shipping: { method: 'TCAT', name: 'A', phone: '0912345678' } } });
ok('宅配未填地址 → 400', q3.status === 400 && String(q3.body.message).includes('地址'));
const q4 = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 3 }], shipping: { method: 'TCAT', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' } } });
ok('宅配滿千免運', q4.status === 201 && q4.body.shippingFee === 0 && q4.body.amount === 1050);
const badInv = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' }, invoice: { type: 'mobile', carrierNum: 'ABC' } } });
ok('手機條碼格式錯 → 400', badInv.status === 400 && String(badInv.body.message).includes('手機條碼'));
const badTax = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' }, invoice: { type: 'company', taxId: '123' } } });
ok('統編格式錯 → 400', badTax.status === 400);
const order = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], shipping: { method: 'UNIMARTC2C', name: '王小明', phone: '0912345678', storeToken: token }, invoice: { type: 'company', taxId: '12345678', title: '測試公司' } } });
ok('建單：超商門市與發票資訊落地', order.status === 201 && order.body.shippingMethod === 'UNIMARTC2C' && order.body.cvsStoreId === '131386' && order.body.shippingAddress === '台北市信義區' && order.body.invoiceType === 'company' && order.body.invoiceTaxId === '12345678', order.body.merchantOrderNo);
const preCreate = await j(`/api/admin/logistics/orders/${order.body.merchantOrderNo}/create`, { method: 'POST', cookie: admin });
ok('未付款不能建物流單', preCreate.status === 400);
const co = await j(`/api/payments/checkout/${order.body.id}`, { method: 'POST', cookie: buyer, body: { provider: 'mock' } });
await j('/api/payments/mock/notify', { method: 'POST', body: { order: order.body.merchantOrderNo, sig: new URL(co.body.redirectUrl).searchParams.get('sig'), result: 'success' } });
// 綠界物流狀態通知（自造簽章）
const notifyParams = { MerchantID: L.merchantId, MerchantTradeNo: order.body.merchantOrderNo, RtnCode: '3024', RtnMsg: '運送中', AllPayLogisticsID: '9999001', LogisticsType: 'CVS', LogisticsSubType: 'UNIMARTC2C', CVSPaymentNo: 'PAY123', CVSValidationNo: '0001', UpdateStatusDate: '2026/09/21 12:00:00' };
notifyParams.CheckMacValue = logisticsCheckMac(notifyParams, L.hashKey, L.hashIv);
const nt = await j('/api/logistics/ecpay/notify', { method: 'POST', form: true, body: notifyParams });
const afterNt = await j(`/api/orders/${order.body.merchantOrderNo}`, { cookie: buyer });
ok('物流通知 → 1|OK、狀態 shipped、寄件代碼寫入', nt.body === '1|OK' && afterNt.body.shippingStatus === 'shipped' && afterNt.body.logisticsId === '9999001' && afterNt.body.trackingNo === 'PAY123', `${afterNt.body.shippingStatus}/${afterNt.body.logisticsStatus}`);
const ntBad = await j('/api/logistics/ecpay/notify', { method: 'POST', form: true, body: { ...notifyParams, RtnCode: '3022' } });
ok('簽章不符的通知被拒', ntBad.body.startsWith('0|'));
const printF = await j(`/api/admin/logistics/orders/${order.body.merchantOrderNo}/print`, { cookie: admin });
ok('託運單列印表單', printF.status === 200 && printF.body.gatewayUrl.includes('PrintUniMartC2COrderInfo') && printF.body.fields.CVSPaymentNo === 'PAY123');

// 4. 發票：provider none → 開立 400；設 ezpay（假參數）→ 呼叫失敗但有 failed 紀錄；列表；OPS
const invNone = await act('issue_invoice', { orderNo: order.body.merchantOrderNo });
ok('未設供應商 → 開立失敗', invNone.body.ok === false);
await act('update_settings', { settings: { 'invoice.provider': 'ezpay', 'invoice.issueTiming': 'manual', 'ezpay.merchantId': '3489', 'ezpay.hashKey': '01234567890123456789012345678901', 'ezpay.hashIv': '0123456789012345', 'ezpay.testMode': 'true' } });
const invCfg = await j('/api/admin/invoices/config', { cookie: admin });
ok('發票設定：ezpay／manual／測試環境', invCfg.body.provider === 'ezpay' && invCfg.body.timing === 'manual' && invCfg.body.ezpay.ready && invCfg.body.ezpay.testMode);
const issue = await j(`/api/admin/invoices/orders/${order.body.merchantOrderNo}/issue`, { method: 'POST', cookie: admin });
ok('ezPay 假參數開立 → 400 並留下 failed 紀錄', issue.status === 400, JSON.stringify(issue.body.message).slice(0, 80));
const invList = await act('list_invoices', {});
ok('OPS list_invoices 有 failed 紀錄', invList.body.ok && invList.body.data.some((i) => i.order.merchantOrderNo === order.body.merchantOrderNo && i.status === 'failed' && i.order.invoiceTaxId === '12345678'));
const { ecpayInvoiceEncrypt, ecpayInvoiceDecrypt } = require(dist + 'invoice/ecpay-invoice.js');
const enc = ecpayInvoiceEncrypt({ a: '中文 test', b: 1 }, 'ejCk326UnaZWKisg', 'q9jcZX8Ib9LM8wYk');
ok('綠界發票 AES-128 往返', JSON.stringify(ecpayInvoiceDecrypt(enc, 'ejCk326UnaZWKisg', 'q9jcZX8Ib9LM8wYk')) === JSON.stringify({ a: '中文 test', b: 1 }));
const opsInvalid = await act('invalidate_invoice', { orderNo: order.body.merchantOrderNo });
ok('無已開立發票 → 作廢失敗', opsInvalid.body.ok === false);
// 還原
await act('update_settings', { settings: { 'invoice.provider': 'none', 'ezpay.enabled': 'false', 'logistics.provider': 'none', 'logistics.methods': 'manual', 'logistics.fees': '' } });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

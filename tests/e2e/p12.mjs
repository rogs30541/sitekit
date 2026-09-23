// P12 本機端到端：藍新物流（配送方式／門市地圖表單／map-reply 解密→token／建單限藍新付款／貨態通知）＋光貿電子發票（設定／簽章／開立／作廢／列表）
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { fileURLToPath } from 'node:url';
const dist = fileURLToPath(new URL('../../packages/core/dist/modules/', import.meta.url));
const B = process.env.API ?? 'http://localhost:4000';
const LIVE_AMEGO = process.env.LIVE_AMEGO === '1'; // 真打光貿測試環境（公開測試統編／App Key）
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

// ===== A. 藍新物流 =====
const NP = { merchantId: 'MS0000000001', hashKey: 'e2eFakeHashKey0123456789abcdefXY', hashIv: 'e2eFakeHashIv123', testMode: true };
const set = await act('update_settings', { settings: { 'payment.provider': 'newebpay', 'payment.methods': 'newebpay,mock', 'newebpay.merchantId': NP.merchantId, 'newebpay.hashKey': NP.hashKey, 'newebpay.hashIv': NP.hashIv, 'newebpay.testMode': 'true', 'logistics.provider': 'both', 'logistics.methods': 'manual,UNIMARTC2C,NWP_UNIMART,NWP_FAMILY', 'logistics.fees': 'UNIMARTC2C=60,NWP_UNIMART=65,NWP_FAMILY=65', 'shipping.fee': '80' } });
ok('物流設定寫入（provider both＋藍新超商）', set.body.ok, JSON.stringify(set.body).slice(0, 120));
const methods = await j('/api/logistics/methods');
const nwpM = methods.body.find((m) => m.id === 'NWP_UNIMART');
ok('配送方式含藍新 7-11（provider newebpay、cvs、運費 65）', methods.status === 200 && nwpM?.provider === 'newebpay' && nwpM?.kind === 'cvs' && nwpM?.fee === 65 && methods.body.some((m) => m.id === 'UNIMARTC2C' && m.provider === 'ecpay'), JSON.stringify(methods.body.map((m) => m.id)));
const cfg = await j('/api/admin/logistics/config', { cookie: admin });
ok('後台物流設定：newebpayReady＋不外洩 HashKey', cfg.status === 200 && cfg.body.newebpayReady === true && cfg.body.newebpayMerchantId === NP.merchantId && !JSON.stringify(cfg.body).includes(NP.hashKey));

const { nwpEncrypt, nwpDecrypt, buildNwpStoreMapForm, mapNwpRetId, NWP_SHIP_TYPES } = require(dist + 'logistics/newebpay-logistics.js');
const f = buildNwpStoreMapForm(NP, { merchantOrderNo: 'MAPTEST1', method: 'NWP_FAMILY', returnUrl: 'https://x/api/logistics/newebpay/map-reply', extraData: 'u1' });
const dec = nwpDecrypt(NP, f.fields.EncryptData_, f.fields.HashData_);
ok('storeMap 表單：UID_/EncryptData_/HashData_ 可回解、ShipType 2', f.gatewayUrl === 'https://ccore.newebpay.com/API/Logistic/storeMap' && f.fields.UID_ === NP.merchantId && f.fields.Version_ === '1.0' && dec?.ShipType === '2' && dec?.LgsType === 'C2C' && dec?.MerchantOrderNo === 'MAPTEST1');
ok('HashData 竄改 → null', nwpDecrypt(NP, f.fields.EncryptData_, 'A'.repeat(64)) === null);
ok('貨態代碼對映', mapNwpRetId('1') === 'pending' && mapNwpRetId('5') === 'shipped' && mapNwpRetId('6') === 'delivered' && mapNwpRetId('-1') === 'returned' && mapNwpRetId('12') === 'returned');
const mapForm = await j('/api/logistics/ecpay/map', { method: 'POST', cookie: buyer, body: { subType: 'NWP_UNIMART' } });
ok('登入者取得藍新門市地圖表單', mapForm.status === 201 && mapForm.body.gatewayUrl.endsWith('/API/Logistic/storeMap') && mapForm.body.fields.UID_ === NP.merchantId, JSON.stringify(mapForm.body).slice(0, 120));
const mapBad = await j('/api/logistics/ecpay/map', { method: 'POST', cookie: buyer, body: { subType: 'NWP_OK' } });
ok('未啟用的藍新取貨方式 → 400', mapBad.status === 400);

// map-reply：自造藍新回傳（JSON 加密）
const storePayload = nwpEncrypt(NP, { MerchantOrderNo: 'MAPTEST1', StoreID: '991182', StoreName: '藍新測試門市', StoreAddr: '台北市中山區南京東路', StoreTel: '02-1234', ShipType: '1', LgsType: 'C2C', ExtraData: 'u1' });
const reply = await j('/api/logistics/newebpay/map-reply', { method: 'POST', form: true, body: { Status: 'SUCCESS', EncryptData: storePayload.EncryptData_, HashData: storePayload.HashData_, UID: NP.merchantId } });
const token = reply.location ? new URL(reply.location).searchParams.get('cvs') : null;
ok('藍新 map-reply → 303 回購物車帶 token', reply.status === 303 && !!token && token !== 'error', reply.location);
const st = await j(`/api/logistics/cvs-store?token=${encodeURIComponent(token ?? '')}`);
ok('token 解出藍新門市（subType NWP_UNIMART）', st.body.id === '991182' && st.body.name === '藍新測試門市' && st.body.subType === 'NWP_UNIMART', JSON.stringify(st.body));
const badReply = await j('/api/logistics/newebpay/map-reply', { method: 'POST', form: true, body: { Status: 'SUCCESS', EncryptData: storePayload.EncryptData_, HashData: 'B'.repeat(64) } });
ok('HashData 錯誤 → cvs=error', badReply.status === 303 && badReply.location.endsWith('/cart?cvs=error'));

// 結帳：藍新超商取貨 + 非藍新付款 → 400
const list = (await j('/api/catalog/products?type=physical')).body;
const mug = list.find((p) => p.sku === 'DEMO-MUG');
const q = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], shipping: { method: 'NWP_UNIMART', name: '取貨人', phone: '0912345678', storeToken: token } } });
ok('藍新超商試算：運費 65、門市帶入', q.status === 201 && q.body.shippingFee === 65 && q.body.store?.id === '991182', JSON.stringify({ fee: q.body.shippingFee, msg: q.body.message }));
const order = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], shipping: { method: 'NWP_UNIMART', name: '取貨人', phone: '0912345678', storeToken: token }, invoice: { type: 'personal' } } });
ok('建立藍新超商取貨訂單', order.status === 201 && order.body.shippingMethod === 'NWP_UNIMART' && order.body.cvsStoreId === '991182', JSON.stringify(order.body).slice(0, 160));
const oid = order.body.id;
const mockPay = await j(`/api/payments/checkout/${oid}`, { method: 'POST', cookie: buyer, body: { provider: 'mock' } });
ok('藍新超商取貨 + mock 付款 → 400', mockPay.status === 400 && String(mockPay.body.message).includes('藍新'), JSON.stringify(mockPay.body).slice(0, 120));
const nwpPay = await j(`/api/payments/checkout/${oid}`, { method: 'POST', cookie: buyer, body: { provider: 'newebpay' } });
ok('藍新付款表單可產生', nwpPay.status === 201 && String(nwpPay.body.gatewayUrl).includes('newebpay.com') && nwpPay.body.fields?.MerchantID === NP.merchantId, JSON.stringify(nwpPay.body).slice(0, 120));
// 未付款建寄貨單 → 400（provider 未設）
const createUnpaid = await act('create_logistics_order', { orderNo: oid });
ok('未付款建寄貨單 → 拒絕', !createUnpaid.body.ok && String(createUnpaid.body.error).includes('付款'), JSON.stringify(createUnpaid.body).slice(0, 160));

// 貨態通知（B58）：自造加密 → SUCCESS，訂單 shippingStatus 變更
const mno = order.body.merchantOrderNo;
const n1 = nwpEncrypt(NP, { MerchantOrderNo: mno, LgsNo: 'LGS0001', RetId: '5', RetMsg: '送達門市', ShipType: '1', LgsType: 'C2C' });
const notify1 = await j('/api/logistics/newebpay/notify', { method: 'POST', form: true, body: { Status: 'SUCCESS', Message: 'ok', EncryptData_: n1.EncryptData_, HashData_: n1.HashData_, UID_: NP.merchantId, Version_: '1.0' } });
const o1 = await j(`/api/orders/${oid}`, { cookie: buyer });
ok('貨態 5 → SUCCESS、shippingStatus shipped、trackingNo LgsNo', notify1.body === 'SUCCESS' && o1.body.shippingStatus === 'shipped' && o1.body.trackingNo === 'LGS0001' && o1.body.logisticsStatus === '5', JSON.stringify({ n: notify1.body, s: o1.body.shippingStatus, t: o1.body.trackingNo }));
const n2 = nwpEncrypt(NP, { MerchantOrderNo: mno, LgsNo: 'LGS0001', RetId: '6' });
const notify2 = await j('/api/logistics/newebpay/notify', { method: 'POST', form: true, body: { Status: 'SUCCESS', EncryptData_: n2.EncryptData_, HashData_: n2.HashData_ } });
const o2 = await j(`/api/orders/${oid}`, { cookie: buyer });
ok('貨態 6 → delivered', notify2.body === 'SUCCESS' && o2.body.shippingStatus === 'delivered');
const notifyBad = await j('/api/logistics/newebpay/notify', { method: 'POST', form: true, body: { Status: 'SUCCESS', EncryptData_: n2.EncryptData_, HashData_: 'C'.repeat(64) } });
ok('偽造通知 → FAIL', notifyBad.body === 'FAIL');
const printNo = await j(`/api/admin/logistics/orders/${oid}/print`, { cookie: admin }).catch(() => ({ status: 0 }));
ok('未建寄貨單列印 → 400', printNo.status === 400 || printNo.status === 404, String(printNo.status));

// ===== B. 光貿電子發票 =====
const { amegoSign, AMEGO_CARRIER } = require(dist + 'invoice/amego-invoice.js');
ok('光貿簽章 md5(data+time+key)', amegoSign('{"a":1}', 1700000000, 'k') === require('node:crypto').createHash('md5').update('{"a":1}1700000000k').digest('hex') && AMEGO_CARRIER.mobile === '3J0002');
const invSet = await act('update_settings', { settings: { 'invoice.provider': 'amego', 'invoice.issueTiming': 'manual', 'amego.taxId': '12345678', 'amego.appKey': 'sHeq7t8G1wiQvhAuIM27' } });
ok('發票設定寫入光貿', invSet.body.ok);
const icfg = await j('/api/admin/invoices/config', { cookie: admin });
ok('後台發票設定：provider amego、ready、測試公司、不外洩 App Key', icfg.status === 200 && icfg.body.provider === 'amego' && icfg.body.amego?.ready === true && icfg.body.amego?.testMode === true && !JSON.stringify(icfg.body).includes('sHeq7t8G1wiQvhAuIM27'), JSON.stringify(icfg.body));
// 結帳發票欄位驗證仍生效
const badInv = await j('/api/orders/quote', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], shipping: { method: 'manual', name: 'A', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' }, invoice: { type: 'mobile', carrierNum: 'ABC' } } });
ok('手機條碼格式錯 → 400', badInv.status === 400);
if (LIVE_AMEGO) {
  // 真打光貿測試環境：先用 mock 付款把訂單變 paid，再開立
  await act('update_settings', { settings: { 'payment.provider': 'mock', 'payment.methods': 'mock,newebpay' } });
  const o = await j('/api/orders', { method: 'POST', cookie: buyer, body: { items: [{ productId: mug.id, qty: 1 }], shipping: { method: 'manual', name: '買家', phone: '0912345678', address: '台北市中正區重慶南路一段 1 號' }, invoice: { type: 'mobile', carrierNum: '/ABC+123' } } });
  const co = await j(`/api/payments/checkout/${o.body.id}`, { method: 'POST', cookie: buyer, body: { provider: 'mock' } });
  const paid = await j('/api/payments/mock/notify', { method: 'POST', body: { order: o.body.merchantOrderNo, sig: new URL(co.body.redirectUrl).searchParams.get('sig'), result: 'success' } });
  ok('LIVE 前置：mock 付款完成', paid.status < 300, JSON.stringify(paid.body).slice(0, 120));
  const issue = await act('issue_invoice', { orderNo: o.body.id });
  console.log('LIVE amego issue →', JSON.stringify(issue.body).slice(0, 300));
  ok('光貿測試環境開立成功', issue.body.ok && issue.body.data?.number, JSON.stringify(issue.body).slice(0, 200));
  const lst = await act('list_invoices', {});
  ok('發票列表含光貿', lst.body.ok && JSON.stringify(lst.body).includes('"amego"'), JSON.stringify(lst.body).slice(0, 200));
  const inv = await act('invalidate_invoice', { orderNo: o.body.id, reason: 'e2e' });
  console.log('LIVE amego invalidate →', JSON.stringify(inv.body).slice(0, 200));
  ok('光貿作廢', inv.body.ok);
}
// 還原設定
await act('update_settings', { settings: { 'payment.provider': 'mock', 'payment.methods': 'mock,newebpay', 'invoice.provider': 'none', 'logistics.provider': 'ecpay', 'logistics.methods': 'manual,UNIMARTC2C,TCAT' } });
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);

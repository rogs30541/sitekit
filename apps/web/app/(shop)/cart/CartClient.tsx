'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { INVOICE_TYPE_LABELS } from '@sitekit/shared';
import { twd, type Product } from '@/lib/api-public';
import { clearCart, lineKey, onCartChange, readCart, setQty, type CartLine } from '@/lib/cart';
import { fetchPaymentMethods, startCheckout, type PaymentMethod } from '@/lib/checkout';
import { skTrack } from '@/lib/track';
import { t as tr } from '@/lib/i18n';

interface Quote {
  items: { productId: string; name: string; qty: number; unitPrice: number; type: string }[];
  subtotal: number;
  discount: number;
  couponCode: string | null;
  shippingFee: number;
  needsShipping: boolean;
  amount: number;
  shippingMethod?: { id: string; label: string; kind: 'cvs' | 'home' | 'manual' } | null;
  store?: { id: string; name: string; address: string } | null;
}
interface ShipMethod {
  id: string;
  label: string;
  fee: number;
  kind: 'cvs' | 'home' | 'manual';
}
type InvoiceType = 'personal' | 'mobile' | 'citizen' | 'company' | 'donate';
const input = 'w-full rounded border px-2 py-1 text-sm';

/** 購物車：金額由 /api/orders/quote 試算（折扣碼、配送方式運費）；超商取貨走綠界電子地圖；發票資訊隨訂單送出。 */
export function CartClient() {
  const search = useSearchParams();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [ship, setShip] = useState({ name: '', phone: '', address: '' });
  const [shipMethods, setShipMethods] = useState<ShipMethod[]>([]);
  const [shipMethod, setShipMethod] = useState('');
  const [storeToken, setStoreToken] = useState('');
  const [store, setStore] = useState<{ id: string; name: string; address: string } | null>(null);
  const [inv, setInv] = useState<{ type: InvoiceType; carrierNum: string; taxId: string; title: string; loveCode: string }>({ type: 'personal', carrierNum: '', taxId: '', title: '', loveCode: '' });
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const load = () => setLines(readCart());
    load();
    fetch('/api/catalog/products')
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Product[]) => setProducts(Object.fromEntries(list.map((p) => [p.id, p]))));
    fetchPaymentMethods().then((m) => {
      setMethods(m);
      setMethod(m[0]?.id ?? '');
    });
    fetch('/api/logistics/methods')
      .then((r) => (r.ok ? r.json() : []))
      .then((m: ShipMethod[]) => {
        setShipMethods(m);
        setShipMethod((prev) => prev || m[0]?.id || '');
      });
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((j) => setAuthed(!!j.authenticated))
      .catch(() => setAuthed(false));
    // 綠界選門市導回：?cvs=<token>；收件資料暫存在 sessionStorage
    const cvs = search.get('cvs');
    try {
      const saved = sessionStorage.getItem('sitekit.checkout');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.ship) setShip(s.ship);
        if (s.shipMethod) setShipMethod(s.shipMethod);
        if (s.inv) setInv(s.inv);
        if (s.applied) setApplied(s.applied);
      }
    } catch {
      /* ignore */
    }
    if (cvs && cvs !== 'error') {
      setStoreToken(cvs);
      fetch(`/api/logistics/cvs-store?token=${encodeURIComponent(cvs)}`)
        .then((r) => r.json())
        .then((s) => {
          if (s?.id) {
            setStore(s);
            if (s.subType) setShipMethod(s.subType);
          }
        })
        .catch(() => undefined);
    }
    return onCartChange(load);
  }, []);

  useEffect(() => {
    if (!lines.length || authed !== true) {
      setQuote(null);
      return;
    }
    const ctl = new AbortController();
    const body = { items: lines, couponCode: applied || undefined, shipping: { method: shipMethod || undefined, name: ship.name || tr('暫'), phone: ship.phone || '0000000000', address: ship.address, storeToken: storeToken || undefined }, invoice: { type: 'personal' } };
    fetch('/api/orders/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) {
          const m = typeof j.message === 'string' ? j.message : JSON.stringify(j.message);
          // 超商未選門市／宅配未填地址屬於流程提示，不清空試算
          if (/門市|地址/.test(m)) {
            setQuoteError('');
            setQuote((q) => q);
          } else {
            setQuoteError(m);
            if (applied) setApplied('');
            setQuote(null);
          }
        } else {
          setQuoteError('');
          setQuote(j as Quote);
        }
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, [lines, applied, authed, shipMethod, storeToken]);

  const current = shipMethods.find((m) => m.id === shipMethod);
  // 藍新超商取貨：寄貨單需同訂單編號的藍新金流交易 → 只能用藍新付款
  const nwpShip = shipMethod.startsWith('NWP_');
  const payMethods = nwpShip ? methods.filter((m) => m.id === 'newebpay') : methods;
  useEffect(() => {
    if (payMethods.length && !payMethods.some((m) => m.id === method)) setMethod(payMethods[0].id);
  }, [payMethods, method]);
  const needsShipping = quote?.needsShipping ?? lines.some((l) => products[l.productId]?.type === 'physical');

  async function pickStore() {
    try {
      sessionStorage.setItem('sitekit.checkout', JSON.stringify({ ship, shipMethod, inv, applied }));
    } catch {
      /* ignore */
    }
    const r = await fetch('/api/logistics/ecpay/map', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subType: shipMethod }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(typeof j.message === 'string' ? j.message : tr('無法開啟門市地圖'));
      return;
    }
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = j.gatewayUrl;
    for (const [k, v] of Object.entries(j.fields as Record<string, string>)) {
      const i = document.createElement('input');
      i.type = 'hidden';
      i.name = k;
      i.value = v;
      form.appendChild(i);
    }
    document.body.appendChild(form);
    form.submit();
  }

  async function submit() {
    setBusy(true);
    setError('');
    skTrack('InitiateCheckout', { value: quote?.amount, items: lines.map((l) => ({ id: l.productId, name: products[l.productId]?.name ?? l.productId, price: products[l.productId]?.price ?? 0, qty: l.qty })) });
    try {
      const body = {
        items: lines,
        couponCode: applied || undefined,
        shipping: needsShipping ? { method: shipMethod, name: ship.name, phone: ship.phone, address: ship.address, storeToken: storeToken || undefined } : undefined,
        invoice: { type: inv.type, carrierNum: inv.carrierNum || null, taxId: inv.taxId || null, title: inv.title || null, loveCode: inv.loveCode || null },
      };
      const o = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const order = await o.json();
      if (!o.ok) throw new Error(typeof order.message === 'string' ? order.message : JSON.stringify(order.message ?? order));
      clearCart();
      try {
        sessionStorage.removeItem('sitekit.checkout');
      } catch {
        /* ignore */
      }
      if (order.status === 'paid') {
        window.location.href = `/order-result?order=${order.merchantOrderNo}`;
        return;
      }
      await startCheckout(order.id, method || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (!lines.length)
    return (
      <p style={{ color: 'var(--muted)' }}>
        {tr('購物車是空的。')}
        <Link href="/store" className="ml-2 underline">
          {tr('去逛商城')}
        </Link>
      </p>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs" style={{ color: 'var(--muted)' }}>
              <th className="py-1">{tr('商品')}</th>
              <th className="py-1">{tr('單價')}</th>
              <th className="py-1">{tr('數量')}</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const p = products[l.productId];
              const v = l.variantId ? p?.variants?.find((x) => x.id === l.variantId) : undefined;
              return (
                <tr key={lineKey(l)} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <td className="py-2">
                    {p?.name ?? l.productId}
                    {v ? <span className="ml-1 rounded bg-neutral-100 px-1 text-xs">{v.name}</span> : null}
                  </td>
                  <td className="py-2">{p ? twd(v?.price ?? p.price) : '—'}</td>
                  <td className="py-2">
                    <input type="number" min={1} max={99} value={l.qty} onChange={(e) => setQty(lineKey(l), Math.max(1, Math.min(99, Number(e.target.value) || 1)))} className="w-16 rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }} />
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => setQty(lineKey(l), 0)} className="text-xs underline">
                      {tr('移除')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {needsShipping ? (
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
            <p className="mb-2 text-sm font-semibold">{tr('配送方式')}</p>
            <div className="space-y-1 text-sm">
              {shipMethods.map((m) => (
                <label key={m.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={shipMethod === m.id}
                    onChange={() => {
                      setShipMethod(m.id);
                      setStore(null);
                      setStoreToken('');
                    }}
                  />
                  {m.label}
                  <span className="text-xs" style={{ color: 'var(--muted)' }}>
                    運費 {m.fee ? twd(m.fee) : tr('免費')}
                  </span>
                </label>
              ))}
            </div>
            {current?.kind === 'cvs' ? (
              <div className="mt-2 text-sm">
                {store ? (
                  <p>
                    {tr('取貨門市：')}<strong>{store.name}</strong>（{store.id}）{store.address}
                    <button onClick={pickStore} className="ml-2 text-xs underline">
                      {tr('重新選擇')}
                    </button>
                  </p>
                ) : (
                  <button onClick={pickStore} disabled={authed !== true} className="rounded border px-3 py-1 text-xs disabled:opacity-50" style={{ borderColor: 'var(--line)' }}>
                    {tr('選擇取貨門市（綠界電子地圖）')}
                  </button>
                )}
                {search.get('cvs') === 'error' ? <p className="text-xs text-red-700">{tr('門市選擇失敗，請再試一次。')}</p> : null}
              </div>
            ) : null}
            <p className="mb-1 mt-3 text-sm font-semibold">{current?.kind === 'cvs' ? '取貨人資料' : '收件資料'}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs">
                {tr('姓名')}
                <input className={input} style={{ borderColor: 'var(--line)' }} value={ship.name} onChange={(e) => setShip({ ...ship, name: e.target.value })} />
              </label>
              <label className="block text-xs">
                {tr('手機')}
                <input className={input} style={{ borderColor: 'var(--line)' }} value={ship.phone} onChange={(e) => setShip({ ...ship, phone: e.target.value })} />
              </label>
              {current?.kind !== 'cvs' ? (
                <label className="block text-xs sm:col-span-2">
                  {tr('地址')}
                  <input className={input} style={{ borderColor: 'var(--line)' }} value={ship.address} onChange={(e) => setShip({ ...ship, address: e.target.value })} />
                </label>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
          <p className="mb-2 text-sm font-semibold">{tr('電子發票')}</p>
          <select value={inv.type} onChange={(e) => setInv({ ...inv, type: e.target.value as InvoiceType })} className={input} style={{ borderColor: 'var(--line)' }}>
            {(Object.keys(INVOICE_TYPE_LABELS) as InvoiceType[]).map((t) => (
              <option key={t} value={t}>
                {INVOICE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          {inv.type === 'mobile' ? <input className={`${input} mt-2`} style={{ borderColor: 'var(--line)' }} placeholder={tr('手機條碼（/ 開頭共 8 碼）')} value={inv.carrierNum} onChange={(e) => setInv({ ...inv, carrierNum: e.target.value.toUpperCase() })} /> : null}
          {inv.type === 'citizen' ? <input className={`${input} mt-2`} style={{ borderColor: 'var(--line)' }} placeholder={tr('自然人憑證條碼（2 英文＋14 數字）')} value={inv.carrierNum} onChange={(e) => setInv({ ...inv, carrierNum: e.target.value.toUpperCase() })} /> : null}
          {inv.type === 'company' ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input className={input} style={{ borderColor: 'var(--line)' }} placeholder={tr('統一編號（8 碼）')} value={inv.taxId} onChange={(e) => setInv({ ...inv, taxId: e.target.value.replace(/\D/g, '').slice(0, 8) })} />
              <input className={input} style={{ borderColor: 'var(--line)' }} placeholder={tr('公司抬頭')} value={inv.title} onChange={(e) => setInv({ ...inv, title: e.target.value })} />
            </div>
          ) : null}
          {inv.type === 'donate' ? <input className={`${input} mt-2`} style={{ borderColor: 'var(--line)' }} placeholder={tr('愛心碼（3–7 碼數字）')} value={inv.loveCode} onChange={(e) => setInv({ ...inv, loveCode: e.target.value.replace(/\D/g, '').slice(0, 7) })} /> : null}
        </div>
      </div>
      <div className="space-y-3 rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--line)' }}>
        {authed === false ? (
          <p>
            結帳前請先{' '}
            <Link href="/login?next=/cart" className="underline">
              {tr('登入')}
            </Link>
            。
          </p>
        ) : null}
        <div className="flex gap-2">
          <input placeholder={tr('折扣碼')} value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} className={input} style={{ borderColor: 'var(--line)' }} />
          <button onClick={() => setApplied(coupon.trim())} className="whitespace-nowrap rounded border px-3 text-xs" style={{ borderColor: 'var(--line)' }}>
            {tr('套用')}
          </button>
        </div>
        {quoteError ? <p className="text-xs text-red-700">{quoteError}</p> : null}
        {quote ? (
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between">
              <dt>{tr('小計')}</dt>
              <dd>{twd(quote.subtotal)}</dd>
            </div>
            {quote.discount ? (
              <div className="flex justify-between text-green-700">
                <dt>折扣（{quote.couponCode}）</dt>
                <dd>−{twd(quote.discount)}</dd>
              </div>
            ) : null}
            {quote.needsShipping ? (
              <div className="flex justify-between">
                <dt>運費{current ? `（${current.label}）` : ''}</dt>
                <dd>{quote.shippingFee ? twd(quote.shippingFee) : tr('免運')}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold">
              <dt>{tr('應付')}</dt>
              <dd>{twd(quote.amount)}</dd>
            </div>
          </dl>
        ) : null}
        {nwpShip && !payMethods.length ? <p className="text-sm text-red-600">{tr('藍新超商取貨需啟用藍新金流付款')}</p> : null}
        {nwpShip && payMethods.length ? <p className="text-xs" style={{ color: 'var(--muted)' }}>{tr('藍新超商取貨僅能以藍新金流付款')}</p> : null}
        {payMethods.length > 1 ? (
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={input} style={{ borderColor: 'var(--line)' }} aria-label={tr('付款方式')}>
            {payMethods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.testMode ? tr('（測試）') : ''}
              </option>
            ))}
          </select>
        ) : null}
        <button onClick={submit} disabled={busy || !quote || authed !== true || (needsShipping && current?.kind === 'cvs' && !store) || (nwpShip && !payMethods.length)} className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50">
          {busy ? tr('前往付款…') : tr('結帳')}
        </button>
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}

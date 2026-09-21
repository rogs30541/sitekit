'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { twd, type Product } from '@/lib/api-public';
import { clearCart, onCartChange, readCart, setQty, type CartLine } from '@/lib/cart';
import { fetchPaymentMethods, startCheckout, type PaymentMethod } from '@/lib/checkout';

interface Quote {
  items: { productId: string; name: string; qty: number; unitPrice: number; type: string }[];
  subtotal: number;
  discount: number;
  couponCode: string | null;
  shippingFee: number;
  needsShipping: boolean;
  amount: number;
}
const input = 'w-full rounded border px-2 py-1 text-sm';

/** 購物車：金額一律由 /api/orders/quote 試算（折扣碼、運費）；實體商品需收件資料；建單後走共用結帳。 */
export function CartClient() {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [products, setProducts] = useState<Record<string, Product>>({});
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [ship, setShip] = useState({ name: '', phone: '', address: '' });
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
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((j) => setAuthed(!!j.authenticated))
      .catch(() => setAuthed(false));
    return onCartChange(load);
  }, []);

  useEffect(() => {
    if (!lines.length || authed !== true) {
      setQuote(null);
      return;
    }
    const ctl = new AbortController();
    fetch('/api/orders/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: lines, couponCode: applied || undefined }), signal: ctl.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) {
          setQuoteError(typeof j.message === 'string' ? j.message : JSON.stringify(j.message));
          if (applied) setApplied('');
          setQuote(null);
        } else {
          setQuoteError('');
          setQuote(j as Quote);
        }
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, [lines, applied, authed]);

  async function submit() {
    if (!quote) return;
    setBusy(true);
    setError('');
    try {
      const body = { items: lines, couponCode: applied || undefined, shipping: quote.needsShipping ? ship : undefined };
      const o = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const order = await o.json();
      if (!o.ok) throw new Error(typeof order.message === 'string' ? order.message : JSON.stringify(order.message ?? order));
      clearCart();
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
        購物車是空的。
        <Link href="/store" className="ml-2 underline">
          去逛商城
        </Link>
      </p>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs" style={{ color: 'var(--muted)' }}>
              <th className="py-1">商品</th>
              <th className="py-1">單價</th>
              <th className="py-1">數量</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const p = products[l.productId];
              return (
                <tr key={l.productId} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <td className="py-2">{p?.name ?? l.productId}</td>
                  <td className="py-2">{p ? twd(p.price) : '—'}</td>
                  <td className="py-2">
                    <input type="number" min={1} max={99} value={l.qty} onChange={(e) => setQty(l.productId, Math.max(1, Math.min(99, Number(e.target.value) || 1)))} className="w-16 rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }} />
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => setQty(l.productId, 0)} className="text-xs underline">
                      移除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {quote?.needsShipping ? (
          <div className="mt-4 rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
            <p className="mb-2 text-sm font-semibold">收件資料</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block text-xs">
                收件人
                <input className={input} style={{ borderColor: 'var(--line)' }} value={ship.name} onChange={(e) => setShip({ ...ship, name: e.target.value })} />
              </label>
              <label className="block text-xs">
                電話
                <input className={input} style={{ borderColor: 'var(--line)' }} value={ship.phone} onChange={(e) => setShip({ ...ship, phone: e.target.value })} />
              </label>
              <label className="block text-xs sm:col-span-2">
                地址
                <input className={input} style={{ borderColor: 'var(--line)' }} value={ship.address} onChange={(e) => setShip({ ...ship, address: e.target.value })} />
              </label>
            </div>
          </div>
        ) : null}
      </div>
      <div className="space-y-3 rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--line)' }}>
        {authed === false ? (
          <p>
            結帳前請先{' '}
            <Link href="/login?next=/cart" className="underline">
              登入
            </Link>
            。
          </p>
        ) : null}
        <div className="flex gap-2">
          <input placeholder="折扣碼" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} className={input} style={{ borderColor: 'var(--line)' }} />
          <button onClick={() => setApplied(coupon.trim())} className="whitespace-nowrap rounded border px-3 text-xs" style={{ borderColor: 'var(--line)' }}>
            套用
          </button>
        </div>
        {quoteError ? <p className="text-xs text-red-700">{quoteError}</p> : null}
        {quote ? (
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between">
              <dt>小計</dt>
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
                <dt>運費</dt>
                <dd>{quote.shippingFee ? twd(quote.shippingFee) : '免運'}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold">
              <dt>應付</dt>
              <dd>{twd(quote.amount)}</dd>
            </div>
          </dl>
        ) : null}
        {methods.length > 1 ? (
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={input} style={{ borderColor: 'var(--line)' }} aria-label="付款方式">
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.testMode ? '（測試）' : ''}
              </option>
            ))}
          </select>
        ) : null}
        <button onClick={submit} disabled={busy || !quote || authed !== true} className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50">
          {busy ? '前往付款…' : '結帳'}
        </button>
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
      </div>
    </div>
  );
}

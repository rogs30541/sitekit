'use client';

import { useEffect, useState } from 'react';

type Checkout = { provider: string; kind: 'redirect'; redirectUrl: string } | { provider: string; kind: 'form'; gatewayUrl: string; fields: Record<string, string> };
interface Method {
  id: string;
  label: string;
  testMode: boolean;
}

/** 建單 → 取金流 payload → form 類（藍新／綠界／統一）自動送出表單、redirect 類（LINE Pay／支付連／mock／free）直接導向。 */
export function BuyButton({ productId }: { productId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [methods, setMethods] = useState<Method[]>([]);
  const [method, setMethod] = useState('');

  useEffect(() => {
    fetch('/api/payments/methods')
      .then((r) => (r.ok ? r.json() : []))
      .then((m: Method[]) => {
        setMethods(m);
        setMethod(m[0]?.id ?? '');
      })
      .catch(() => setMethods([]));
  }, []);

  async function buy() {
    setBusy(true);
    setError('');
    try {
      const o = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ productId, qty: 1 }] }) });
      const order = await o.json();
      if (!o.ok) throw new Error(order.message ?? 'create order failed');
      const c = await fetch(`/api/payments/checkout/${order.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(method ? { provider: method } : {}) });
      const payload = (await c.json()) as Checkout & { message?: string };
      if (!c.ok) throw new Error(payload.message ?? 'checkout failed');
      if (payload.kind === 'form') {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = payload.gatewayUrl;
        for (const [k, v] of Object.entries(payload.fields)) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = k;
          input.value = v;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
        return;
      }
      window.location.href = payload.redirectUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {methods.length > 1 ? (
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded border px-2 py-2 text-sm" style={{ borderColor: 'var(--line)' }} aria-label="付款方式">
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.testMode ? '（測試）' : ''}
            </option>
          ))}
        </select>
      ) : null}
      <button onClick={buy} disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
        {busy ? '前往付款…' : '立即購買'}
      </button>
      {methods.length === 1 && methods[0].testMode && methods[0].id !== 'mock' ? (
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {methods[0].label}（測試環境）
        </span>
      ) : null}
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

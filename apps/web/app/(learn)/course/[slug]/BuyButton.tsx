'use client';

import { useState } from 'react';

type Checkout = { provider: 'free' | 'mock'; redirectUrl: string } | { provider: 'newebpay'; gatewayUrl: string; fields: Record<string, string> };

/** 建單 → 取金流 payload → 藍新用自動送出表單、mock／free 直接導向。 */
export function BuyButton({ productId }: { productId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function buy() {
    setBusy(true);
    setError('');
    try {
      const o = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ productId, qty: 1 }] }) });
      const order = await o.json();
      if (!o.ok) throw new Error(order.message ?? 'create order failed');
      const c = await fetch(`/api/payments/checkout/${order.id}`, { method: 'POST' });
      const payload = (await c.json()) as Checkout & { message?: string };
      if (!c.ok) throw new Error(payload.message ?? 'checkout failed');
      if (payload.provider === 'newebpay') {
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
    <span className="flex items-center gap-2">
      <button onClick={buy} disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
        {busy ? '前往付款…' : '立即購買'}
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </span>
  );
}

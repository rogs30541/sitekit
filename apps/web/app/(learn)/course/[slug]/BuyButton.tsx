'use client';

import { useEffect, useState } from 'react';
import { fetchPaymentMethods, startCheckout, type PaymentMethod } from '@/lib/checkout';
import { t } from '@/lib/i18n';

/** 課程單品購買：建單 → 結帳（多家金流時顯示付款方式選單）。 */
export function BuyButton({ productId, label }: { productId: string; label?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [method, setMethod] = useState('');

  useEffect(() => {
    fetchPaymentMethods().then((m) => {
      setMethods(m);
      setMethod(m[0]?.id ?? '');
    });
  }, []);

  async function buy() {
    setBusy(true);
    setError('');
    try {
      const o = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ productId, qty: 1 }] }) });
      const order = await o.json();
      if (!o.ok) throw new Error(typeof order.message === 'string' ? order.message : 'create order failed');
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

  return (
    <span className="flex flex-wrap items-center gap-2">
      {methods.length > 1 ? (
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded border px-2 py-2 text-sm" style={{ borderColor: 'var(--line)' }} aria-label={t('付款方式')}>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
              {m.testMode ? t('（測試）') : ''}
            </option>
          ))}
        </select>
      ) : null}
      <button onClick={buy} disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
        {busy ? t('前往付款…') : label || t('立即購買')}
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

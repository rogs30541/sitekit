'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';

export function MockGateway({ order, sig }: { order: string; sig: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pay(result: 'success' | 'fail') {
    setBusy(true);
    setError('');
    const r = await fetch('/api/payments/mock/notify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order, sig, result }) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.message ?? `HTTP ${r.status}`);
      setBusy(false);
      return;
    }
    router.push(`/order-result?order=${encodeURIComponent(order)}`);
  }

  return (
    <div className="mt-4 flex gap-2">
      <button onClick={() => pay('success')} disabled={busy} className="rounded bg-green-700 px-4 py-2 text-sm text-white disabled:opacity-50">
        {t('模擬付款成功')}
      </button>
      <button onClick={() => pay('fail')} disabled={busy} className="rounded border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: 'var(--line)' }}>
        {t('模擬付款失敗')}
      </button>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}

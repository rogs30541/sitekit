'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Order } from '@/lib/api-public';

export function OrderActions({ order }: { order: Order }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function call(path: string, body: unknown) {
    setBusy(true);
    setMsg('');
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? '完成' : (j.message ?? `HTTP ${r.status}`));
    setBusy(false);
    router.refresh();
  }

  const btn = 'rounded border px-2 py-1 text-xs disabled:opacity-50';
  return (
    <div className="flex flex-wrap gap-1">
      {order.status === 'pending' ? (
        <button disabled={busy} className={btn} style={{ borderColor: 'var(--line)' }} onClick={() => call(`/api/admin/orders/${order.merchantOrderNo}/mark-paid`, { note: '人工核帳' })}>
          標記已付款
        </button>
      ) : null}
      {order.status === 'paid' ? (
        <>
          <button disabled={busy} className={btn} style={{ borderColor: 'var(--line)' }} onClick={() => call(`/api/admin/payments/refund/${order.merchantOrderNo}`, { approve: true })}>
            核准退款
          </button>
          {order.refundStatus === 'requested' ? (
            <button disabled={busy} className={btn} style={{ borderColor: 'var(--line)' }} onClick={() => call(`/api/admin/payments/refund/${order.merchantOrderNo}`, { approve: false, note: '不符合退款條件' })}>
              駁回
            </button>
          ) : null}
        </>
      ) : null}
      {msg ? <span style={{ color: 'var(--muted)' }}>{msg}</span> : null}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SHIPPING_LABELS, SHIPPING_STATUSES } from '@sitekit/shared';
import type { Order } from '@/lib/api-public';

export function OrderActions({ order }: { order: Order }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ship, setShip] = useState({ status: order.shippingStatus ?? 'pending', carrier: order.carrier ?? '', trackingNo: order.trackingNo ?? '' });

  async function call(path: string, body: unknown, method = 'POST') {
    setBusy(true);
    setMsg('');
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? '完成' : typeof j.message === 'string' ? j.message : `HTTP ${r.status}`);
    setBusy(false);
    router.refresh();
  }

  const btn = 'rounded border px-2 py-1 text-xs disabled:opacity-50';
  const field = 'rounded border px-1 py-0.5 text-xs';
  return (
    <div className="flex flex-col gap-1">
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
      </div>
      {order.shippingStatus && order.status === 'paid' ? (
        <div className="flex flex-wrap items-center gap-1">
          <select value={ship.status} onChange={(e) => setShip({ ...ship, status: e.target.value })} className={field} style={{ borderColor: 'var(--line)' }}>
            {SHIPPING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SHIPPING_LABELS[s]}
              </option>
            ))}
          </select>
          <input placeholder="物流商" value={ship.carrier} onChange={(e) => setShip({ ...ship, carrier: e.target.value })} className={`${field} w-20`} style={{ borderColor: 'var(--line)' }} />
          <input placeholder="追蹤碼" value={ship.trackingNo} onChange={(e) => setShip({ ...ship, trackingNo: e.target.value })} className={`${field} w-28`} style={{ borderColor: 'var(--line)' }} />
          <button disabled={busy} className={btn} style={{ borderColor: 'var(--line)' }} onClick={() => call(`/api/admin/orders/${order.merchantOrderNo}/shipping`, { status: ship.status, carrier: ship.carrier || null, trackingNo: ship.trackingNo || null }, 'PATCH')}>
            更新物流
          </button>
        </div>
      ) : null}
      {msg ? <span style={{ color: 'var(--muted)' }}>{msg}</span> : null}
    </div>
  );
}

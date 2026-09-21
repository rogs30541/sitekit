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

  async function call(path: string, body?: unknown, method = 'POST') {
    setBusy(true);
    setMsg('');
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? (typeof j.number === 'string' ? `完成 ${j.number}` : j.logisticsId ? `物流單 ${j.logisticsId}` : '完成') : typeof j.message === 'string' ? j.message : `HTTP ${r.status}`);
    setBusy(false);
    router.refresh();
  }
  /** 託運單：向 api 取表單再以新視窗 POST 到綠界 */
  async function print() {
    const r = await fetch(`/api/admin/logistics/orders/${order.merchantOrderNo}/print`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(typeof j.message === 'string' ? j.message : '無法列印');
      return;
    }
    const w = window.open('', '_blank');
    if (!w) return;
    const form = w.document.createElement('form');
    form.method = 'POST';
    form.action = j.gatewayUrl;
    for (const [k, v] of Object.entries(j.fields as Record<string, string>)) {
      const i = w.document.createElement('input');
      i.type = 'hidden';
      i.name = k;
      i.value = v;
      form.appendChild(i);
    }
    w.document.body.appendChild(form);
    form.submit();
  }

  const btn = 'rounded border px-2 py-1 text-xs disabled:opacity-50';
  const field = 'rounded border px-1 py-0.5 text-xs';
  const invoice = order.invoices?.[0];
  const ecpayShip = order.shippingMethod && order.shippingMethod !== 'manual';
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
            {!invoice || invoice.status !== 'issued' ? (
              <button disabled={busy} className={btn} style={{ borderColor: 'var(--line)' }} onClick={() => call(`/api/admin/invoices/orders/${order.merchantOrderNo}/issue`)}>
                開立發票
              </button>
            ) : (
              <button disabled={busy} className={btn} style={{ borderColor: 'var(--line)' }} onClick={() => window.confirm('作廢此發票？') && call(`/api/admin/invoices/orders/${order.merchantOrderNo}/invalidate`)}>
                作廢發票 {invoice.number}
              </button>
            )}
          </>
        ) : null}
      </div>
      {order.shippingStatus && order.status === 'paid' ? (
        <div className="flex flex-wrap items-center gap-1">
          {ecpayShip && !order.logisticsId ? (
            <button disabled={busy} className={btn} style={{ borderColor: 'var(--line)' }} onClick={() => call(`/api/admin/logistics/orders/${order.merchantOrderNo}/create`)}>
              建立物流單
            </button>
          ) : null}
          {order.logisticsId ? (
            <button disabled={busy} className={btn} style={{ borderColor: 'var(--line)' }} onClick={print}>
              列印託運單
            </button>
          ) : null}
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

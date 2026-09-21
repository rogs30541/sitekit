'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fmtDate } from '@/lib/api-public';

export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minAmount: number;
  maxUses: number | null;
  usedCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  note: string | null;
}
const input = 'rounded border px-2 py-1 text-sm';

export function CouponsClient({ coupons }: { coupons: Coupon[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ code: '', type: 'percent', value: '10', minAmount: '0', maxUses: '', expiresAt: '', note: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setMsg('');
    const body = { code: form.code, type: form.type, value: Number(form.value), minAmount: Number(form.minAmount) || 0, maxUses: form.maxUses ? Number(form.maxUses) : null, expiresAt: form.expiresAt ? new Date(form.expiresAt + 'T23:59:59+08:00').toISOString() : null, note: form.note || null };
    const r = await fetch('/api/admin/coupons', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `已建立 ${j.code}` : typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
    setBusy(false);
    if (r.ok) {
      setForm({ ...form, code: '' });
      router.refresh();
    }
  }

  async function toggle(c: Coupon) {
    await fetch(`/api/admin/coupons/${c.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isActive: !c.isActive }) });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <label className="text-xs">
          代碼
          <br />
          <input className={input} style={{ borderColor: 'var(--line)' }} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WELCOME10" />
        </label>
        <label className="text-xs">
          類型
          <br />
          <select className={input} style={{ borderColor: 'var(--line)' }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="percent">百分比 %</option>
            <option value="fixed">固定金額</option>
          </select>
        </label>
        <label className="text-xs">
          數值
          <br />
          <input className={`${input} w-20`} style={{ borderColor: 'var(--line)' }} type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
        </label>
        <label className="text-xs">
          低消
          <br />
          <input className={`${input} w-24`} style={{ borderColor: 'var(--line)' }} type="number" value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} />
        </label>
        <label className="text-xs">
          次數上限
          <br />
          <input className={`${input} w-20`} style={{ borderColor: 'var(--line)' }} type="number" value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} placeholder="不限" />
        </label>
        <label className="text-xs">
          到期日
          <br />
          <input className={input} style={{ borderColor: 'var(--line)' }} type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </label>
        <label className="text-xs">
          備註
          <br />
          <input className={input} style={{ borderColor: 'var(--line)' }} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
        <button onClick={create} disabled={busy || !form.code} className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50">
          建立
        </button>
        {msg ? <span className="text-xs">{msg}</span> : null}
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr style={{ color: 'var(--muted)' }}>
            <th className="py-1">代碼</th>
            <th className="py-1">折扣</th>
            <th className="py-1">低消</th>
            <th className="py-1">使用</th>
            <th className="py-1">到期</th>
            <th className="py-1">狀態</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {coupons.map((c) => (
            <tr key={c.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <td className="py-1 font-mono">{c.code}</td>
              <td className="py-1">{c.type === 'percent' ? `${c.value}%` : `NT$ ${c.value}`}</td>
              <td className="py-1">{c.minAmount || '—'}</td>
              <td className="py-1">
                {c.usedCount}
                {c.maxUses ? ` / ${c.maxUses}` : ''}
              </td>
              <td className="py-1">{c.expiresAt ? fmtDate(c.expiresAt) : '—'}</td>
              <td className="py-1">{c.isActive ? '啟用' : '停用'}</td>
              <td className="py-1">
                <button onClick={() => toggle(c)} className="underline">
                  {c.isActive ? '停用' : '啟用'}
                </button>
              </td>
            </tr>
          ))}
          {!coupons.length ? (
            <tr>
              <td colSpan={7} className="py-2" style={{ color: 'var(--muted)' }}>
                尚無折扣碼
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

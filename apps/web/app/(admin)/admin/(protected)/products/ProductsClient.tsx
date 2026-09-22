'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { twd } from '@/lib/api-public';

export interface AdminProduct {
  id: string;
  type: 'physical' | 'course' | 'credit_pack';
  sku: string;
  name: string;
  price: number;
  isActive: boolean;
  stock: number | null;
  sortOrder: number;
  course: { slug: string } | null;
  _count: { items: number; variants?: number };
}
const input = 'rounded border px-2 py-1 text-sm';
const TYPE: Record<AdminProduct['type'], string> = { physical: '實體', course: '課程', credit_pack: '點數包' };

export function ProductsClient({ products }: { products: AdminProduct[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ type: 'physical', sku: '', name: '', price: '', stock: '', description: '', coverUrl: '' });
  const [msg, setMsg] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});

  async function create() {
    setMsg('');
    const body = { type: form.type, sku: form.sku, name: form.name, price: Number(form.price) || 0, stock: form.stock === '' ? null : Number(form.stock), description: form.description || null, coverUrl: form.coverUrl || '' };
    const r = await fetch('/api/admin/catalog/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `已建立 ${j.name}` : typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
    if (r.ok) {
      setForm({ ...form, sku: '', name: '', price: '', stock: '' });
      router.refresh();
    }
  }

  async function remove(p: AdminProduct) {
    if (!window.confirm(`刪除商品「${p.name}」？已有訂單紀錄的商品無法刪除，只能下架。`)) return;
    const r = await fetch(`/api/admin/catalog/products/${p.id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `已刪除 ${p.name}` : typeof j.message === 'string' ? j.message : '刪除失敗');
    router.refresh();
  }
  async function patch(id: string, data: Record<string, unknown>) {
    const r = await fetch(`/api/admin/catalog/products/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? '已更新' : typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <select className={input} style={{ borderColor: 'var(--line)' }} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="physical">實體商品</option>
          <option value="credit_pack">點數包</option>
        </select>
        <input className={`${input} w-28`} style={{ borderColor: 'var(--line)' }} placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        <input className={`${input} w-48`} style={{ borderColor: 'var(--line)' }} placeholder="名稱" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className={`${input} w-24`} style={{ borderColor: 'var(--line)' }} type="number" placeholder="價格" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <input className={`${input} w-24`} style={{ borderColor: 'var(--line)' }} type="number" placeholder="庫存（空＝不追蹤）" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
        <input className={`${input} w-56`} style={{ borderColor: 'var(--line)' }} placeholder="封面圖網址" value={form.coverUrl} onChange={(e) => setForm({ ...form, coverUrl: e.target.value })} />
        <button onClick={create} disabled={!form.sku || !form.name} className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50">
          新增商品
        </button>
        {msg ? <span className="text-xs">{msg}</span> : null}
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr style={{ color: 'var(--muted)' }}>
            <th className="py-1">類型</th>
            <th className="py-1">SKU</th>
            <th className="py-1">名稱</th>
            <th className="py-1">價格</th>
            <th className="py-1">庫存</th>
            <th className="py-1">已售</th>
            <th className="py-1">上架</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <td className="py-1">{TYPE[p.type]}</td>
              <td className="py-1 font-mono">{p.sku}</td>
              <td className="py-1">
                {p.type === 'course' && p.course ? (
                  <span>{p.name}</span>
                ) : (
                  <Link href={`/admin/products/${p.id}`} className="font-semibold hover:underline">
                    {p.name}
                  </Link>
                )}
                {p._count.variants ? <span className="ml-1 rounded bg-neutral-100 px-1 text-[10px]">{p._count.variants} 規格</span> : null}
              </td>
              <td className="py-1">{twd(p.price)}</td>
              <td className="py-1">
                {p.type === 'physical' ? (
                  <span className="flex items-center gap-1">
                    <input className={`${input} w-20`} style={{ borderColor: 'var(--line)' }} placeholder="不追蹤" value={edits[p.id] ?? (p.stock === null ? '' : String(p.stock))} onChange={(e) => setEdits({ ...edits, [p.id]: e.target.value })} />
                    <button className="underline" onClick={() => patch(p.id, { stock: (edits[p.id] ?? '') === '' ? null : Number(edits[p.id]) })}>
                      存
                    </button>
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="py-1">{p._count.items}</td>
              <td className="py-1">
                <button className="underline" onClick={() => patch(p.id, { isActive: !p.isActive })}>
                  {p.isActive ? '上架中（下架）' : '已下架（上架）'}
                </button>
              </td>
              <td className="py-1 text-right">
                {p.type === 'course' ? null : (
                  <>
                    <Link href={`/admin/products/${p.id}`} className="mr-2 underline">
                      編輯／規格
                    </Link>
                    <button className="text-red-700 underline" onClick={() => remove(p)}>
                      刪除
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

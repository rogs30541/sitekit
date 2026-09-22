'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { checkUploadSize } from '@/lib/upload-image';

export interface Variant {
  id?: string;
  name: string;
  sku: string;
  price: number | null;
  stock: number | null;
  isActive: boolean;
  sortOrder: number;
  options: Record<string, string>;
}
export interface Spec {
  name: string;
  values: string[];
}
export interface ProductDetail {
  id: string;
  type: 'physical' | 'course' | 'credit_pack';
  sku: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  price: number;
  stock: number | null;
  isActive: boolean;
  sortOrder: number;
  category: string | null;
  specs: Spec[] | null;
  variants: Variant[];
  _count?: { items: number };
}
const input = 'w-full rounded border px-2 py-1 text-sm';
const line = { borderColor: 'var(--line)' } as const;

async function uploadImage(file: File): Promise<string> {
  checkUploadSize(file);
  const dataBase64 = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
  const r = await fetch('/api/admin/content/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof j.message === 'string' ? j.message : '上傳失敗');
  return j.url as string;
}
const combos = (specs: Spec[]): Record<string, string>[] => {
  const valid = specs.filter((s) => s.name.trim() && s.values.length);
  if (!valid.length) return [];
  return valid.reduce<Record<string, string>[]>((acc, s) => acc.flatMap((row) => s.values.map((v) => ({ ...row, [s.name.trim()]: v }))), [{}]);
};
const comboName = (o: Record<string, string>) => Object.values(o).join(' / ');

/** 商品編輯：簡易資訊＋多規格（規格定義 → 產生組合 → 每個組合自訂 SKU／價格／庫存／上架） */
export function ProductEditor({ initial }: { initial: ProductDetail }) {
  const router = useRouter();
  const [p, setP] = useState({ name: initial.name, sku: initial.sku, price: String(initial.price), stock: initial.stock === null ? '' : String(initial.stock), description: initial.description ?? '', coverUrl: initial.coverUrl ?? '', category: initial.category ?? '', isActive: initial.isActive, sortOrder: String(initial.sortOrder) });
  const [specs, setSpecs] = useState<Spec[]>(initial.specs?.length ? initial.specs : []);
  const [variants, setVariants] = useState<Variant[]>(initial.variants ?? []);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveInfo() {
    setBusy(true);
    setMsg('');
    const body = { name: p.name, sku: p.sku, price: Math.round(Number(p.price) || 0), stock: p.stock === '' ? null : Math.max(0, Math.round(Number(p.stock))), description: p.description || null, coverUrl: p.coverUrl || '', category: p.category || null, isActive: p.isActive, sortOrder: Number(p.sortOrder) || 0 };
    const r = await fetch(`/api/admin/catalog/products/${initial.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(`儲存失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
    setMsg('商品資訊已儲存');
    router.refresh();
  }
  function generate() {
    const rows = combos(specs);
    if (!rows.length) return setMsg('請先填規格名稱與選項（例：顏色：黑、白；尺寸：S、M、L）');
    setVariants((cur) => {
      const byName = new Map(cur.map((v) => [v.name, v]));
      return rows.map((o, i) => {
        const name = comboName(o);
        const hit = byName.get(name);
        return hit ? { ...hit, options: o, sortOrder: i } : { name, sku: `${p.sku}-${i + 1}`, price: null, stock: null, isActive: true, sortOrder: i, options: o };
      });
    });
    setMsg(`已產生 ${rows.length} 個規格組合；未存在的組合會新增、原有的保留其 SKU／價格／庫存`);
  }
  async function saveVariants() {
    setBusy(true);
    setMsg('');
    const r = await fetch(`/api/admin/catalog/products/${initial.id}/variants`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ specs: specs.filter((s) => s.name.trim()), variants: variants.map((v, i) => ({ ...v, sortOrder: i })) }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(`規格儲存失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
    setVariants(j.variants ?? []);
    setMsg(`規格已儲存（${(j.variants ?? []).length} 個組合）`);
    router.refresh();
  }
  async function remove() {
    if (!window.confirm('確定刪除這個商品？已有訂單的商品無法刪除，只能下架。')) return;
    const r = await fetch(`/api/admin/catalog/products/${initial.id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(typeof j.message === 'string' ? j.message : '刪除失敗');
    router.push('/admin/products');
    router.refresh();
  }
  const setV = (i: number, patch: Partial<Variant>) => setVariants((vs) => vs.map((v, k) => (k === i ? { ...v, ...patch } : v)));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="space-y-2 rounded-lg border p-3" style={{ ...line, background: 'var(--card)' }}>
        <h3 className="text-sm font-bold">簡易資訊</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="col-span-2 block">
            名稱
            <input className={input} style={line} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          </label>
          <label className="block">
            SKU
            <input className={`${input} font-mono`} style={line} value={p.sku} onChange={(e) => setP({ ...p, sku: e.target.value })} />
          </label>
          <label className="block">
            分類
            <input className={input} style={line} value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })} placeholder="例：服飾" />
          </label>
          <label className="block">
            價格（主商品；規格未填價格時沿用）
            <input type="number" className={input} style={line} value={p.price} onChange={(e) => setP({ ...p, price: e.target.value })} />
          </label>
          <label className="block">
            庫存（空＝不追蹤；有規格時以各規格庫存為準）
            <input type="number" className={input} style={line} value={p.stock} onChange={(e) => setP({ ...p, stock: e.target.value })} disabled={initial.type !== 'physical'} />
          </label>
          <label className="col-span-2 block">
            商品說明
            <textarea className={input} style={line} rows={4} value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} />
          </label>
          <label className="col-span-2 block">
            封面圖
            <span className="flex gap-2">
              <input className={input} style={line} value={p.coverUrl} onChange={(e) => setP({ ...p, coverUrl: e.target.value })} placeholder="https://… 或上傳" />
              <label className="shrink-0 cursor-pointer rounded border px-2 py-1" style={line}>
                上傳
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      setP({ ...p, coverUrl: await uploadImage(f) });
                    } catch (err) {
                      setMsg(err instanceof Error ? err.message : String(err));
                    }
                  }}
                />
              </label>
            </span>
            {p.coverUrl ? <img src={p.coverUrl} alt="" className="mt-1 h-24 rounded border object-cover" style={line} /> : null}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={p.isActive} onChange={(e) => setP({ ...p, isActive: e.target.checked })} /> 上架
          </label>
          <label className="block">
            排序（小在前）
            <input type="number" className={input} style={line} value={p.sortOrder} onChange={(e) => setP({ ...p, sortOrder: e.target.value })} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={saveInfo} disabled={busy} className="rounded bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50">
            儲存商品資訊
          </button>
          <button onClick={remove} disabled={busy} className="rounded border px-3 py-1.5 text-xs text-red-700" style={line}>
            刪除商品
          </button>
          {initial._count?.items ? (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              已售 {initial._count.items}（有訂單紀錄的商品不可刪除）
            </span>
          ) : null}
        </div>
      </section>

      <section className="space-y-2 rounded-lg border p-3" style={{ ...line, background: 'var(--card)' }}>
        <h3 className="text-sm font-bold">多規格</h3>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          定義規格（例：顏色、尺寸）與選項，按「產生規格組合」後可為每個組合設定 SKU、價格（空＝沿用主商品）、庫存與上架。前台選購時會選規格；訂單與庫存依規格計算。
        </p>
        {specs.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
            <input className={`${input} w-28`} style={line} value={s.name} placeholder="規格名稱（顏色）" onChange={(e) => setSpecs(specs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
            <input className={`${input} flex-1`} style={line} value={s.values.join('、')} placeholder="選項（黑、白、灰）" onChange={(e) => setSpecs(specs.map((x, k) => (k === i ? { ...x, values: e.target.value.split(/[、,，/／]/).map((v) => v.trim()).filter(Boolean) } : x)))} />
            <button className="text-red-700" onClick={() => setSpecs(specs.filter((_, k) => k !== i))}>
              移除
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 text-xs">
          <button className="rounded border px-2 py-1" style={line} onClick={() => setSpecs([...specs, { name: '', values: [] }])} disabled={specs.length >= 3}>
            ＋ 規格（最多 3 層）
          </button>
          <button className="rounded border px-2 py-1" style={line} onClick={generate}>
            產生規格組合
          </button>
        </div>
        {variants.length ? (
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: 'var(--muted)' }}>
                <th className="py-1">規格</th>
                <th className="py-1">SKU</th>
                <th className="py-1">價格</th>
                <th className="py-1">庫存</th>
                <th className="py-1">上架</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => (
                <tr key={i} className="border-t" style={line}>
                  <td className="py-1">
                    <input className={input} style={line} value={v.name} onChange={(e) => setV(i, { name: e.target.value })} />
                  </td>
                  <td className="py-1">
                    <input className={`${input} font-mono`} style={line} value={v.sku} onChange={(e) => setV(i, { sku: e.target.value })} />
                  </td>
                  <td className="py-1">
                    <input type="number" className={`${input} w-24`} style={line} value={v.price ?? ''} placeholder={p.price} onChange={(e) => setV(i, { price: e.target.value === '' ? null : Number(e.target.value) })} />
                  </td>
                  <td className="py-1">
                    <input type="number" className={`${input} w-20`} style={line} value={v.stock ?? ''} placeholder="不追蹤" onChange={(e) => setV(i, { stock: e.target.value === '' ? null : Number(e.target.value) })} />
                  </td>
                  <td className="py-1">
                    <input type="checkbox" checked={v.isActive} onChange={(e) => setV(i, { isActive: e.target.checked })} />
                  </td>
                  <td className="py-1">
                    <button className="text-red-700" onClick={() => setVariants(variants.filter((_, k) => k !== i))}>
                      移除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            尚無規格組合（單一規格商品可不設定）。
          </p>
        )}
        <button onClick={saveVariants} disabled={busy} className="rounded bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50">
          儲存規格
        </button>
      </section>
      {msg ? <p className="text-xs lg:col-span-2">{msg}</p> : null}
    </div>
  );
}

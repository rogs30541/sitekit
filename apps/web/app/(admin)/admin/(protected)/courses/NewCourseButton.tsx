'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** 新增課程：建立課程與對應商品（type=course），預設未發布；建立後進課程編輯頁補章節與影片。 */
export function NewCourseButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', slug: '', price: '1990', summary: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const input = 'w-full rounded border px-2 py-1 text-sm';
  async function create() {
    setBusy(true);
    setMsg('');
    const slug = f.slug.trim() || f.name.trim().toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '') || `course-${Date.now().toString(36)}`;
    const body = { slug, summary: f.summary || null, isPublished: false, product: { sku: `COURSE-${slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 40)}`, name: f.name.trim(), price: Math.round(Number(f.price) || 0), description: null, coverUrl: '' } };
    const r = await fetch('/api/admin/catalog/courses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
    router.push(`/admin/courses/${j.id}`);
    router.refresh();
  }
  return (
    <span className="inline-block">
      <button onClick={() => setOpen((o) => !o)} className="rounded bg-black px-3 py-1 text-xs text-white">
        ＋ 新增課程
      </button>
      {open ? (
        <div className="mt-2 grid max-w-xl gap-2 rounded-lg border p-3 text-xs sm:grid-cols-2" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
          <label className="block sm:col-span-2">
            課程名稱
            <input className={input} style={{ borderColor: 'var(--line)' }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="例：AI 入門實戰" />
          </label>
          <label className="block">
            網址 slug（可留空自動產生）
            <input className={`${input} font-mono`} style={{ borderColor: 'var(--line)' }} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} placeholder="ai-basics" />
          </label>
          <label className="block">
            價格（NT$，0＝免費）
            <input type="number" className={input} style={{ borderColor: 'var(--line)' }} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </label>
          <label className="block sm:col-span-2">
            一句話摘要
            <input className={input} style={{ borderColor: 'var(--line)' }} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button onClick={create} disabled={busy || !f.name.trim()} className="rounded bg-black px-3 py-1.5 text-white disabled:opacity-50">
              建立（未發布，接著編輯章節）
            </button>
            <button onClick={() => setOpen(false)} className="rounded border px-3 py-1.5" style={{ borderColor: 'var(--line)' }}>
              取消
            </button>
            {msg ? <span className="text-red-700">{msg}</span> : null}
          </div>
        </div>
      ) : null}
    </span>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** 新增（一律建立為草稿）＋匯入設計 JSON（建立草稿，不自動發佈） */
export function NewContentButton({ type }: { type: 'page' | 'post' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function importJson(file: File) {
    setBusy(true);
    setMsg('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const r = await fetch('/api/admin/content/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, ...(parsed.design || parsed.root || parsed.blocks ? parsed : { design: parsed }) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.message === 'string' ? j.message : '匯入失敗');
      router.push(`/admin/content/${j.id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }
  return (
    <>
    {type === 'page' ? (
      <label className="cursor-pointer rounded border px-3 py-1 hover:bg-neutral-50" style={{ borderColor: 'var(--line)' }}>
        匯入設計 JSON
        <input type="file" accept="application/json,.json" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      </label>
    ) : null}
    {msg ? <span className="text-red-700">{msg}</span> : null}
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await fetch('/api/admin/content', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, title: type === 'page' ? '新頁面' : '新文章', body: '<p></p>', status: 'draft' }) });
        const j = await r.json().catch(() => ({}));
        setBusy(false);
        if (r.ok) router.push(`/admin/content/${j.id}`);
      }}
      className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
    >
      ＋ 新增{type === 'post' ? '文章' : '頁面'}
    </button>
    </>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function NewContentButton({ type }: { type: 'page' | 'post' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
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
  );
}

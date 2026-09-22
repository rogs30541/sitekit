'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function NewSalesPageButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          const title = window.prompt('銷售頁標題', '新銷售頁');
          if (!title) return;
          setBusy(true);
          const r = await fetch('/api/admin/sales', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title }) });
          const j = await r.json().catch(() => ({}));
          setBusy(false);
          if (!r.ok) return setMsg(typeof j.message === 'string' ? j.message : '建立失敗');
          router.push(`/admin/sales/${j.page.id}`);
        }}
        className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        ＋ 新增銷售頁
      </button>
      {msg ? <span className="text-red-700">{msg}</span> : null}
    </>
  );
}

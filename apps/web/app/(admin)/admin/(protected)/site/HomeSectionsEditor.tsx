'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SectionInput } from '@sitekit/shared';
import { SectionsEditor } from '@/components/admin/SectionsEditor';

/** 首頁版面：共用 SectionsEditor（與套版、區塊頁同一套 20 種 kind），整組 PUT /api/admin/site/home（伺服器 zod 驗證）。 */
export function HomeSectionsEditor({ initial }: { initial: SectionInput[] }) {
  const [sections, setSections] = useState<SectionInput[]>(initial);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/admin/site/home', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sections }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? '已儲存首頁版面，前台 60 秒內更新。' : `失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
    if (r.ok) setSections(j as SectionInput[]);
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button onClick={save} disabled={busy} className="rounded bg-black px-4 py-1.5 text-white disabled:opacity-50">
          儲存首頁版面
        </button>
        {msg ? <span className="text-xs">{msg}</span> : null}
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          想一次換整站版面請到{' '}
          <Link href="/admin/site/templates" className="underline">
            套版庫
          </Link>
          ；套用後這裡會顯示版型的區塊，可逐個微調。
        </span>
      </div>
      <SectionsEditor value={sections} onChange={setSections} />
    </div>
  );
}

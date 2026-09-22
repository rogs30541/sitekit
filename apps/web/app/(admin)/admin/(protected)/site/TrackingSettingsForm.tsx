'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { normalizeTracking, type TrackingConfig } from '@sitekit/shared';
import { TrackingFields } from '@/components/TrackingFields';

/** 網站層級追蹤設定（套用到所有頁面；頁面設計器／銷售頁可再覆蓋） */
export function TrackingSettingsForm({ initial }: { initial: Partial<TrackingConfig> | null }) {
  const router = useRouter();
  const [value, setValue] = useState<TrackingConfig>(normalizeTracking(initial ?? {}));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  async function save() {
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/admin/site/tracking', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(`儲存失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
    setValue(normalizeTracking(j));
    setMsg('已儲存；前台最多 60 秒後生效（ISR）。ID 格式不符的欄位會被清空。');
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <TrackingFields value={value} onChange={setValue} />
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
          儲存追蹤設定
        </button>
        {msg ? <span className="text-xs">{msg}</span> : null}
      </div>
    </div>
  );
}

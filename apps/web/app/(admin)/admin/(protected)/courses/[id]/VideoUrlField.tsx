'use client';

import { useState } from 'react';

export interface ResolvedVideo {
  provider: 'youtube';
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
}

/** 貼 YouTube 網址 → 呼叫後台 resolve（oEmbed）→ 即時顯示縮圖與標題（Power Course 體驗）。 */
export function VideoUrlField({ value, onChange, compact = false }: { value: ResolvedVideo | null; onChange: (v: ResolvedVideo | null) => void; compact?: boolean }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function resolve(u: string) {
    if (!u.trim()) return;
    setBusy(true);
    setError('');
    const r = await fetch(`/api/admin/videos/resolve?url=${encodeURIComponent(u.trim())}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(j.message ?? '無法解析');
    } else if (!j.resolved) {
      setError('找不到這支影片（私人影片或網址錯誤）');
    } else {
      onChange({ provider: 'youtube', id: j.id, title: j.title, thumbnailUrl: j.thumbnailUrl });
      setUrl('');
    }
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="flex-1 rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--line)' }} placeholder="貼上 YouTube 網址後按 Enter 或失焦" value={url} onChange={(e) => setUrl(e.target.value)} onBlur={() => resolve(url)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), resolve(url))} />
        <button type="button" disabled={busy} onClick={() => resolve(url)} className="rounded border px-2 py-1 text-xs disabled:opacity-50" style={{ borderColor: 'var(--line)' }}>
          {busy ? '解析中…' : '解析'}
        </button>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {value ? (
        <div className={`flex items-center gap-2 rounded border p-2 ${compact ? '' : ''}`} style={{ borderColor: 'var(--line)' }}>
          {value.thumbnailUrl ? <img src={value.thumbnailUrl} alt="" className={compact ? 'h-10 w-16 rounded object-cover' : 'h-16 w-28 rounded object-cover'} /> : null}
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-semibold">{value.title ?? '（已綁定）'}</p>
            <p className="truncate" style={{ color: 'var(--muted)' }}>
              YouTube · {value.id}
            </p>
          </div>
          <button type="button" onClick={() => onChange(null)} className="rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--line)' }}>
            移除
          </button>
        </div>
      ) : (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          尚未綁定影片
        </p>
      )}
    </div>
  );
}

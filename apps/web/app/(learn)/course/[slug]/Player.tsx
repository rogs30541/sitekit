'use client';

import { useState } from 'react';

interface Play {
  provider: string;
  configured?: boolean;
  embedUrl?: string;
  expires?: number;
  message?: string;
}

/** 播放網址由 api 即時簽發（Bunny token 1 小時），前端拿不到永久網址。 */
export function Player({ chapterId }: { chapterId: string }) {
  const [play, setPlay] = useState<Play | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const r = await fetch(`/api/learn/play/${chapterId}`);
      const j = (await r.json()) as Play & { message?: string };
      setPlay(r.ok ? j : { provider: 'error', message: j.message ?? '無法取得播放授權' });
    } finally {
      setBusy(false);
    }
  }

  if (!play) {
    return (
      <button onClick={load} disabled={busy} className="mt-2 rounded border px-3 py-1 text-xs" style={{ borderColor: 'var(--line)' }}>
        {busy ? '取得播放授權…' : '播放'}
      </button>
    );
  }
  if (play.embedUrl) {
    return (
      <div className="mt-2 aspect-video w-full overflow-hidden rounded-lg bg-black">
        <iframe src={play.embedUrl} className="h-full w-full" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  return (
    <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
      已取得授權，但{play.message ?? '影片尚未接上'}。
    </p>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { YouTubePlayer } from './YouTubePlayer';
import { t } from '@/lib/i18n';

interface Play {
  provider: string;
  configured?: boolean;
  embedUrl?: string;
  videoId?: string;
  host?: string;
  poster?: string | null;
  title?: string;
  expires?: number;
  message?: string;
}

export interface PlayerProps {
  chapterId: string;
  autoLoad?: boolean;
  startAt?: number;
  onProgress?: (positionSec: number, durationSec: number) => void;
  onEnded?: () => void;
}

/** 播放設定由 api 在授權檢查後即時回傳；SSR HTML 與公開 API 都不含影片來源。 */
export function Player({ chapterId, autoLoad = false, startAt = 0, onProgress, onEnded }: PlayerProps) {
  const [play, setPlay] = useState<Play | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const r = await fetch(`/api/learn/play/${chapterId}`);
      const j = (await r.json()) as Play & { message?: string };
      setPlay(r.ok ? j : { provider: 'error', message: j.message ?? t('無法取得播放授權') });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setPlay(null);
    if (autoLoad) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, autoLoad]);

  if (!play) {
    return autoLoad ? (
      <div className="aspect-video w-full rounded-lg bg-black" />
    ) : (
      <button onClick={load} disabled={busy} className="mt-2 rounded border px-3 py-1 text-xs" style={{ borderColor: 'var(--line)' }}>
        {busy ? t('取得播放授權…') : t('播放')}
      </button>
    );
  }
  if (play.provider === 'youtube' && play.videoId) {
    return <YouTubePlayer videoId={play.videoId} host={play.host} poster={play.poster ?? null} title={play.title ?? ''} startAt={startAt} onProgress={onProgress} onEnded={onEnded} />;
  }
  if (play.embedUrl) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <iframe src={play.embedUrl} className="h-full w-full" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-neutral-900 text-xs text-white">
      {play.message ?? t('影片尚未接上')}
    </div>
  );
}

'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Player } from '@/app/(learn)/course/[slug]/Player';
import { t } from '@/lib/i18n';

/** 播放器＋進度回報：每 5 秒回報一次位置；≥90% 或按鈕＝完成。 */
export function ChapterStage({ chapterId, hasVideo, initialCompleted, startAt, nextHref }: { chapterId: string; hasVideo: boolean; initialCompleted: boolean; startAt: number; nextHref: string | null }) {
  const router = useRouter();
  const [completed, setCompleted] = useState(initialCompleted);
  const [percent, setPercent] = useState(0);
  const [busy, setBusy] = useState(false);
  const lastSent = useRef(0);

  const report = useCallback(
    async (positionSec: number, done?: boolean) => {
      const r = await fetch(`/api/learn/progress/${chapterId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ positionSec, ...(done !== undefined ? { completed: done } : {}) }) });
      if (r.ok && done) {
        setCompleted(done);
        router.refresh();
      }
    },
    [chapterId, router],
  );

  const onProgress = (pos: number, dur: number) => {
    if (dur > 0) setPercent(Math.min(100, Math.round((pos / dur) * 100)));
    const now = Date.now();
    if (now - lastSent.current < 5000) return;
    lastSent.current = now;
    const done = dur > 0 && pos / dur >= 0.9 && !completed ? true : undefined;
    void report(pos, done);
  };

  async function markDone() {
    setBusy(true);
    await report(0, !completed);
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {hasVideo ? <Player chapterId={chapterId} autoLoad startAt={completed ? 0 : startAt} onProgress={onProgress} onEnded={() => report(0, true)} /> : <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-neutral-900 text-xs text-white">{t('這一章沒有影片（影片準備中）')}</div>}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span style={{ color: 'var(--muted)' }}>觀看進度 {percent}%</span>
        <button onClick={markDone} disabled={busy} className="rounded border px-3 py-1 disabled:opacity-50" style={{ borderColor: 'var(--line)' }}>
          {completed ? t('取消完成標記') : t('標記為已完成')}
        </button>
        {completed && nextHref ? (
          <a href={nextHref} className="rounded bg-black px-3 py-1 text-white">
            {t('前往下一個')}
          </a>
        ) : null}
      </div>
    </div>
  );
}

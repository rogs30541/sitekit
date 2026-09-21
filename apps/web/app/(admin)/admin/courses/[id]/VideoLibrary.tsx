'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface VideoAsset {
  id: string;
  provider: string;
  externalId: string;
  title: string;
  thumbnailUrl: string | null;
  author: string | null;
}

/** 匯入 YouTube：貼網址（每行一個）或播放清單 ID；不需要 API 金鑰。建議影片設「不公開」。 */
export function VideoLibrary({ videos }: { videos: VideoAsset[] }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [playlist, setPlaylist] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function importVideos() {
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/admin/videos/youtube', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, playlist: playlist || undefined }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `匯入 ${j.imported?.length ?? 0} 支${j.rejected?.length ? `，略過 ${j.rejected.length} 筆無效` : ''}` : (j.message ?? `HTTP ${r.status}`));
    setBusy(false);
    setText('');
    router.refresh();
  }
  async function remove(id: string) {
    await fetch(`/api/admin/videos/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="space-y-3 text-xs">
      <p style={{ color: 'var(--muted)' }}>
        把影片上傳到你的 YouTube 頻道並設為「不公開」，再把網址貼進來。前台播放會用自製播放器蓋掉 YouTube 介面，公開頁面與 API 不會出現影片 ID。
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={'https://youtu.be/xxxxxxxxxxx\nhttps://www.youtube.com/watch?v=yyyyyyyyyyy'} className="w-full rounded border p-2 font-mono" style={{ borderColor: 'var(--line)' }} />
      <div className="flex flex-wrap items-center gap-2">
        <input value={playlist} onChange={(e) => setPlaylist(e.target.value)} placeholder="或播放清單 ID / 網址（公開清單，最近 15 支）" className="min-w-64 rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }} />
        <button onClick={importVideos} disabled={busy || (!text.trim() && !playlist.trim())} className="rounded bg-black px-3 py-1 text-white disabled:opacity-50">
          {busy ? '匯入中…' : '匯入'}
        </button>
        <span style={{ color: 'var(--muted)' }}>{msg}</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {videos.map((v) => (
          <li key={v.id} className="flex items-center gap-2 rounded border p-2" style={{ borderColor: 'var(--line)' }}>
            {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" className="h-12 w-20 rounded object-cover" /> : <div className="h-12 w-20 rounded bg-neutral-200" />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{v.title}</p>
              <p className="truncate" style={{ color: 'var(--muted)' }}>
                {v.author ?? ''}
              </p>
            </div>
            <button onClick={() => remove(v.id)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }}>
              移除
            </button>
          </li>
        ))}
        {!videos.length ? <li style={{ color: 'var(--muted)' }}>影片庫是空的。</li> : null}
      </ul>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VideoAsset } from './VideoLibrary';

export interface AdminChapter {
  id: string;
  order: number;
  title: string;
  videoProvider: 'bunny' | 'youtube';
  videoProviderId: string | null;
  durationSec: number | null;
  isPreview: boolean;
}

const input = 'rounded border px-2 py-1 text-xs';

function Row({ ch, videos, onSaved }: { ch: AdminChapter; videos: VideoAsset[]; onSaved: () => void }) {
  const [form, setForm] = useState(ch);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    setBusy(true);
    setMsg('');
    const r = await fetch(`/api/admin/catalog/chapters/${ch.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order: form.order, title: form.title, videoProvider: form.videoProvider, videoProviderId: form.videoProviderId || null, durationSec: form.durationSec, isPreview: form.isPreview }),
    });
    setMsg(r.ok ? '已儲存' : `失敗 ${r.status}`);
    setBusy(false);
    onSaved();
  }
  async function remove() {
    if (!window.confirm(`刪除章節「${ch.title}」？`)) return;
    await fetch(`/api/admin/catalog/chapters/${ch.id}`, { method: 'DELETE' });
    onSaved();
  }

  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[3rem_1fr_6rem_1fr_5rem_auto]" style={{ borderColor: 'var(--line)' }}>
      <input className={input} style={{ borderColor: 'var(--line)' }} type="number" min={1} value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
      <input className={input} style={{ borderColor: 'var(--line)' }} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <select className={input} style={{ borderColor: 'var(--line)' }} value={form.videoProvider} onChange={(e) => setForm({ ...form, videoProvider: e.target.value as AdminChapter['videoProvider'], videoProviderId: '' })}>
        <option value="youtube">YouTube</option>
        <option value="bunny">Bunny</option>
      </select>
      {form.videoProvider === 'youtube' ? (
        <select className={input} style={{ borderColor: 'var(--line)' }} value={form.videoProviderId ?? ''} onChange={(e) => setForm({ ...form, videoProviderId: e.target.value })}>
          <option value="">（未選影片）</option>
          {videos.map((v) => (
            <option key={v.id} value={v.externalId}>
              {v.title}
            </option>
          ))}
        </select>
      ) : (
        <input className={input} style={{ borderColor: 'var(--line)' }} placeholder="Bunny video GUID" value={form.videoProviderId ?? ''} onChange={(e) => setForm({ ...form, videoProviderId: e.target.value })} />
      )}
      <label className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={form.isPreview} onChange={(e) => setForm({ ...form, isPreview: e.target.checked })} /> 試看
      </label>
      <div className="flex items-center gap-1 text-xs">
        <button onClick={save} disabled={busy} className="rounded bg-black px-2 py-1 text-white disabled:opacity-50">
          儲存
        </button>
        <button onClick={remove} className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }}>
          刪除
        </button>
        <span style={{ color: 'var(--muted)' }}>{msg}</span>
      </div>
    </div>
  );
}

/** 章節編輯器：影片來源選 YouTube 時從影片庫選單挑片；前台永遠只拿到「有沒有影片」與播放設定。 */
export function ChapterEditor({ courseId, chapters, videos }: { courseId: string; chapters: AdminChapter[]; videos: VideoAsset[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const refresh = () => router.refresh();

  async function add() {
    if (!title.trim()) return;
    const order = (chapters.at(-1)?.order ?? 0) + 1;
    await fetch(`/api/admin/catalog/courses/${courseId}/chapters`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order, title: title.trim(), videoProvider: 'youtube' }) });
    setTitle('');
    refresh();
  }

  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        順序 · 標題 · 來源 · 影片 · 試看
      </p>
      {chapters.map((ch) => (
        <Row key={ch.id} ch={ch} videos={videos} onSaved={refresh} />
      ))}
      <div className="flex gap-2">
        <input className={input} style={{ borderColor: 'var(--line)' }} placeholder="新章節標題" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button onClick={add} className="rounded border px-3 py-1 text-xs" style={{ borderColor: 'var(--line)' }}>
          新增章節
        </button>
      </div>
    </div>
  );
}

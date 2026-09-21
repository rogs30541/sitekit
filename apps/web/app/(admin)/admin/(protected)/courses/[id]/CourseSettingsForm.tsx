'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VideoUrlField, type ResolvedVideo } from './VideoUrlField';

export interface AdminCourse {
  id: string;
  slug: string;
  summary: string | null;
  isPublished: boolean;
  coverVideoProvider: string | null;
  coverVideoId: string | null;
  previewVideoProvider: string | null;
  previewVideoId: string | null;
  accessMode: 'unlimited' | 'days' | 'until';
  accessDays: number | null;
  accessUntil: string | null;
  product: { id: string; name: string; price: number; description: string | null; coverUrl: string | null; isActive: boolean };
}

const input = 'w-full rounded border px-2 py-1 text-sm';
const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

/** 課程設定：名稱、slug、價格、簡介、封面圖、封面影片、試看影片、觀看期限、發布。 */
export function CourseSettingsForm({ course }: { course: AdminCourse }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: course.product.name,
    price: course.product.price,
    slug: course.slug,
    summary: course.summary ?? '',
    coverUrl: course.product.coverUrl ?? '',
    isPublished: course.isPublished,
    accessMode: course.accessMode,
    accessDays: course.accessDays ?? 30,
    accessUntil: toLocalInput(course.accessUntil),
  });
  const [cover, setCover] = useState<ResolvedVideo | null>(course.coverVideoId ? { provider: 'youtube', id: course.coverVideoId, title: null, thumbnailUrl: `https://i.ytimg.com/vi/${course.coverVideoId}/hqdefault.jpg` } : null);
  const [preview, setPreview] = useState<ResolvedVideo | null>(course.previewVideoId ? { provider: 'youtube', id: course.previewVideoId, title: null, thumbnailUrl: `https://i.ytimg.com/vi/${course.previewVideoId}/hqdefault.jpg` } : null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    setBusy(true);
    setMsg('');
    const body = {
      product: { name: f.name, price: Number(f.price), coverUrl: f.coverUrl || null },
      slug: f.slug,
      summary: f.summary || null,
      isPublished: f.isPublished,
      coverVideo: cover ? { provider: 'youtube', id: cover.id } : null,
      previewVideo: preview ? { provider: 'youtube', id: preview.id } : null,
      accessMode: f.accessMode,
      accessDays: f.accessMode === 'days' ? Number(f.accessDays) : null,
      accessUntil: f.accessMode === 'until' && f.accessUntil ? new Date(f.accessUntil).toISOString() : null,
    };
    const r = await fetch(`/api/admin/catalog/courses/${course.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? '已儲存' : `失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs">
        課程名稱
        <input className={input} style={{ borderColor: 'var(--line)' }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </label>
      <label className="text-xs">
        銷售頁 slug（/course/…）
        <input className={input} style={{ borderColor: 'var(--line)' }} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />
      </label>
      <label className="text-xs">
        價格（NT$，0＝免費）
        <input className={input} style={{ borderColor: 'var(--line)' }} type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} />
      </label>
      <label className="text-xs">
        封面圖片網址
        <input className={input} style={{ borderColor: 'var(--line)' }} value={f.coverUrl} onChange={(e) => setF({ ...f, coverUrl: e.target.value })} placeholder="https://…" />
      </label>
      <label className="text-xs sm:col-span-2">
        簡介
        <textarea className={input} style={{ borderColor: 'var(--line)' }} rows={3} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
      </label>
      <div className="text-xs">
        <p className="mb-1">課程封面影片（銷售頁公開播放）</p>
        <VideoUrlField value={cover} onChange={setCover} />
      </div>
      <div className="text-xs">
        <p className="mb-1">課程試看影片（未購買者可看）</p>
        <VideoUrlField value={preview} onChange={setPreview} />
      </div>
      <div className="text-xs sm:col-span-2">
        <p className="mb-1">觀看期限</p>
        <div className="flex flex-wrap items-center gap-2">
          {(['unlimited', 'days', 'until'] as const).map((m) => (
            <label key={m} className="flex items-center gap-1">
              <input type="radio" name="accessMode" checked={f.accessMode === m} onChange={() => setF({ ...f, accessMode: m })} />
              {m === 'unlimited' ? '無限制' : m === 'days' ? '購買後固定天數' : '指定日期截止'}
            </label>
          ))}
          {f.accessMode === 'days' ? <input className="w-24 rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }} type="number" min={1} value={f.accessDays} onChange={(e) => setF({ ...f, accessDays: Number(e.target.value) })} /> : null}
          {f.accessMode === 'until' ? <input className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }} type="datetime-local" value={f.accessUntil} onChange={(e) => setF({ ...f, accessUntil: e.target.value })} /> : null}
        </div>
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={f.isPublished} onChange={(e) => setF({ ...f, isPublished: e.target.checked })} /> 已發布
        </label>
        <button onClick={save} disabled={busy} className="rounded bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50">
          儲存課程設定
        </button>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {msg}
        </span>
      </div>
    </div>
  );
}

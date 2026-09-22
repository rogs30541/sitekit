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
  publishedAt?: string | null;
  instructorName?: string | null;
  instructorBio?: string | null;
  purchaseNote?: string | null;
  buttonText?: string | null;
  product: { id: string; name: string; price: number; description: string | null; coverUrl: string | null; isActive: boolean; salePrice?: number | null; saleStartsAt?: string | null; saleEndsAt?: string | null; tags?: string[]; category?: string | null; hidden?: boolean };
}

const input = 'w-full rounded border px-2 py-1 text-sm';
const line = { borderColor: 'var(--line)' } as const;
const toLocalInput = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

async function uploadImage(file: File): Promise<string> {
  const dataBase64 = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
  const r = await fetch('/api/admin/content/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof j.message === 'string' ? j.message : '上傳失敗');
  return j.url as string;
}

/**
 * 課程設定（對標 Power Course）：
 * describe＝課程發佈（slug／隱藏於列表／發布時間）＋課程描述（名稱／分類／標籤／簡短描述／內容／封面圖／封面影片／試看影片／講師）；
 * pricing＝原價／特價／特價排程／免費／購買按鈕文字／購買備註／觀看期限；發布切換在兩頁都可存。
 */
export function CourseSettingsForm({ course, section = 'describe' }: { course: AdminCourse; section?: 'describe' | 'pricing' }) {
  const router = useRouter();
  const p = course.product;
  const [f, setF] = useState({
    name: p.name,
    price: p.price,
    salePrice: p.salePrice ?? ('' as number | ''),
    saleStartsAt: toLocalInput(p.saleStartsAt),
    saleEndsAt: toLocalInput(p.saleEndsAt),
    slug: course.slug,
    summary: course.summary ?? '',
    description: p.description ?? '',
    coverUrl: p.coverUrl ?? '',
    category: p.category ?? '',
    tags: (p.tags ?? []).join('、'),
    hidden: !!p.hidden,
    publishedAt: toLocalInput(course.publishedAt),
    instructorName: course.instructorName ?? '',
    instructorBio: course.instructorBio ?? '',
    purchaseNote: course.purchaseNote ?? '',
    buttonText: course.buttonText ?? '',
    isPublished: course.isPublished,
    accessMode: course.accessMode,
    accessDays: course.accessDays ?? 30,
    accessUntil: toLocalInput(course.accessUntil),
  });
  const [cover, setCover] = useState<ResolvedVideo | null>(course.coverVideoId ? { provider: 'youtube', id: course.coverVideoId, title: null, thumbnailUrl: `https://i.ytimg.com/vi/${course.coverVideoId}/hqdefault.jpg` } : null);
  const [preview, setPreview] = useState<ResolvedVideo | null>(course.previewVideoId ? { provider: 'youtube', id: course.previewVideoId, title: null, thumbnailUrl: `https://i.ytimg.com/vi/${course.previewVideoId}/hqdefault.jpg` } : null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function save(publish?: boolean) {
    setBusy(true);
    setMsg('');
    const isPublished = publish ?? f.isPublished;
    const body = {
      product: { name: f.name, price: Number(f.price), coverUrl: f.coverUrl || null, description: f.description || null, category: f.category || null, tags: f.tags.split(/[、,，]/).map((t) => t.trim()).filter(Boolean), hidden: f.hidden, salePrice: f.salePrice === '' ? null : Number(f.salePrice), saleStartsAt: fromLocal(f.saleStartsAt), saleEndsAt: fromLocal(f.saleEndsAt) },
      slug: f.slug,
      summary: f.summary || null,
      isPublished,
      coverVideo: cover ? { provider: 'youtube', id: cover.id } : null,
      previewVideo: preview ? { provider: 'youtube', id: preview.id } : null,
      accessMode: f.accessMode,
      accessDays: f.accessMode === 'days' ? Number(f.accessDays) : null,
      accessUntil: f.accessMode === 'until' && f.accessUntil ? fromLocal(f.accessUntil) : null,
      publishedAt: fromLocal(f.publishedAt) ?? (isPublished && !course.publishedAt ? new Date().toISOString() : null),
      instructorName: f.instructorName || null,
      instructorBio: f.instructorBio || null,
      purchaseNote: f.purchaseNote || null,
      buttonText: f.buttonText || null,
    };
    const r = await fetch(`/api/admin/catalog/courses/${course.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? (isPublished ? '已儲存並發布' : '已儲存（草稿）') : `失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
    if (r.ok) setF((cur) => ({ ...cur, isPublished }));
    setBusy(false);
    router.refresh();
  }
  const footer = (
    <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
      <button onClick={() => save(false)} disabled={busy} className="rounded border px-4 py-1.5 text-sm disabled:opacity-50" style={line}>
        儲存為草稿
      </button>
      <button onClick={() => save(true)} disabled={busy} className="rounded bg-black px-4 py-1.5 text-sm text-white disabled:opacity-50">
        儲存並發布
      </button>
      <span className="text-xs" style={{ color: 'var(--muted)' }}>
        {msg}
      </span>
    </div>
  );

  if (section === 'pricing')
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Card title="課程定價" desc="特價在排程期間內生效；免費課程請把原價設為 0。">
          <label className="text-xs">
            原價（NT$）
            <input className={input} style={line} type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} />
          </label>
          <label className="text-xs">
            特價（NT$，空＝無特價）
            <input className={input} style={line} type="number" min={0} value={f.salePrice} onChange={(e) => setF({ ...f, salePrice: e.target.value === '' ? '' : Number(e.target.value) })} />
          </label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label>
              特價開始
              <input type="datetime-local" className={input} style={line} value={f.saleStartsAt} onChange={(e) => setF({ ...f, saleStartsAt: e.target.value })} />
            </label>
            <label>
              特價結束
              <input type="datetime-local" className={input} style={line} value={f.saleEndsAt} onChange={(e) => setF({ ...f, saleEndsAt: e.target.value })} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={f.price === 0} onChange={(e) => setF({ ...f, price: e.target.checked ? 0 : p.price || 990 })} /> 這是免費課程
          </label>
        </Card>
        <Card title="購買設定" desc="購買按鈕文字與購買備註會顯示在課程銷售頁的價格旁。">
          <label className="text-xs">
            購買按鈕文字（預設「立即購買」）
            <input className={input} style={line} maxLength={50} value={f.buttonText} onChange={(e) => setF({ ...f, buttonText: e.target.value })} />
          </label>
          <label className="text-xs">
            購買備註
            <textarea className={input} style={line} rows={3} value={f.purchaseNote} onChange={(e) => setF({ ...f, purchaseNote: e.target.value })} placeholder="例：購買後可無限期觀看；含講義下載" />
          </label>
        </Card>
        <Card title="觀看時間限制" desc="無限制／購買後固定天數／指定日期截止。">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(['unlimited', 'days', 'until'] as const).map((m) => (
              <label key={m} className="flex items-center gap-1">
                <input type="radio" name="accessMode" checked={f.accessMode === m} onChange={() => setF({ ...f, accessMode: m })} />
                {m === 'unlimited' ? '無限制' : m === 'days' ? '購買後固定天數' : '指定日期截止'}
              </label>
            ))}
            {f.accessMode === 'days' ? <input className="w-24 rounded border px-2 py-1" style={line} type="number" min={1} value={f.accessDays} onChange={(e) => setF({ ...f, accessDays: Number(e.target.value) })} /> : null}
            {f.accessMode === 'until' ? <input className="rounded border px-2 py-1" style={line} type="datetime-local" value={f.accessUntil} onChange={(e) => setF({ ...f, accessUntil: e.target.value })} /> : null}
          </div>
        </Card>
        {footer}
      </div>
    );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card title="課程發佈" desc="草稿＝尚未發佈、完全無法訪問；「在前台列表中隱藏」則不顯示於列表但仍可透過直接網址訪問。發布時間影響列表排序。">
        <label className="text-xs">
          銷售頁網址 /course/
          <input className={`${input} font-mono`} style={line} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={f.hidden} onChange={(e) => setF({ ...f, hidden: e.target.checked })} /> 在前台列表中隱藏此課程
        </label>
        <label className="text-xs">
          發布時間
          <input type="datetime-local" className={input} style={line} value={f.publishedAt} onChange={(e) => setF({ ...f, publishedAt: e.target.value })} />
        </label>
      </Card>
      <Card title="課程描述" desc="名稱、分類、標籤、簡短描述與完整內容。">
        <label className="text-xs">
          課程名稱
          <input className={input} style={line} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label>
            分類
            <input className={input} style={line} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="例：創業類課程" />
          </label>
          <label>
            標籤（頓號分隔）
            <input className={input} style={line} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="AI、行銷" />
          </label>
        </div>
        <label className="text-xs">
          簡短描述
          <textarea className={input} style={line} rows={2} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
        </label>
        <label className="text-xs">
          內容（課程介紹，可用 HTML）
          <textarea className={input} style={line} rows={6} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
      </Card>
      <Card title="課程封面與影片" desc="封面圖片、封面影片（銷售頁公開播放）、試看影片（未購買者可看）。">
        <label className="text-xs">
          課程封面圖片
          <span className="flex gap-2">
            <input className={input} style={line} value={f.coverUrl} onChange={(e) => setF({ ...f, coverUrl: e.target.value })} placeholder="https://… 或上傳" />
            <label className="shrink-0 cursor-pointer rounded border px-2 py-1" style={line}>
              上傳
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    setF({ ...f, coverUrl: await uploadImage(file) });
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : String(err));
                  }
                }}
              />
            </label>
          </span>
          {f.coverUrl ? <img src={f.coverUrl} alt="" className="mt-1 h-24 rounded border object-cover" style={line} /> : null}
        </label>
        <div className="text-xs">
          <p className="mb-1">課程封面影片</p>
          <VideoUrlField value={cover} onChange={setCover} />
        </div>
        <div className="text-xs">
          <p className="mb-1">課程試看影片</p>
          <VideoUrlField value={preview} onChange={setPreview} />
        </div>
      </Card>
      <Card title="講師資訊" desc="顯示於課程銷售頁與列表。">
        <label className="text-xs">
          講師名稱
          <input className={input} style={line} value={f.instructorName} onChange={(e) => setF({ ...f, instructorName: e.target.value })} />
        </label>
        <label className="text-xs">
          講師簡介
          <textarea className={input} style={line} rows={3} value={f.instructorBio} onChange={(e) => setF({ ...f, instructorBio: e.target.value })} />
        </label>
      </Card>
      {footer}
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
      <h3 className="text-sm font-bold">{title}</h3>
      {desc ? (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          {desc}
        </p>
      ) : null}
      {children}
    </div>
  );
}

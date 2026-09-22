'use client';

import { fmtDateTime } from '@/lib/api-public';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export interface AiTemplate {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  coverUrl: string | null;
  inputFields: { key: string; label: string; type: 'text' | 'textarea' | 'select' | 'image'; required?: boolean; placeholder?: string; options?: string[] }[];
  defaultSize: string;
  costPoints: number;
  highCostPoints: number;
}
export interface CreditBalance {
  stored: number;
  reserved: number;
  available: number;
}
interface AiJob {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  prompt: string;
  quality: string;
  size: string;
  provider: string | null;
  byok: boolean;
  costPoints: number;
  resultUrl: string | null;
  error: string | null;
  createdAt: string;
  template?: { name: string } | null;
}

const STATUS: Record<AiJob['status'], string> = { queued: '排隊中', running: '生成中', succeeded: '完成', failed: '失敗', canceled: '已取消' };
const input = 'w-full rounded border px-2 py-1 text-sm';

/** 工作站：選模板 → 填欄位 → 選品質 → 送出；任務列表每 2 秒輪詢直到沒有進行中的任務。 */
export function StudioClient({ templates, credits: initialCredits, byok }: { templates: AiTemplate[]; credits: CreditBalance; byok: boolean }) {
  const [tpl, setTpl] = useState<AiTemplate | null>(templates[0] ?? null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [credits, setCredits] = useState(initialCredits);
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const categories = Array.from(new Set(templates.map((t) => t.category)));
  async function addImages(files: FileList | null) {
    if (!files) return;
    const next = [...images];
    for (const f of Array.from(files)) {
      if (next.length >= 4) break;
      if (f.size > 10 * 1024 * 1024) {
        setError('參考圖每張上限 10MB');
        continue;
      }
      next.push(await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(fr.error);
        fr.readAsDataURL(f);
      }));
    }
    setImages(next);
  }

  const cost = byok ? 0 : tpl ? (quality === 'high' ? tpl.highCostPoints : tpl.costPoints) : quality === 'high' ? 15 : 5;

  async function refresh() {
    const [j, c] = await Promise.all([fetch('/api/studio/jobs').then((r) => (r.ok ? r.json() : [])), fetch('/api/credits/me').then((r) => (r.ok ? r.json() : null))]);
    setJobs(j);
    if (c) setCredits(c);
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!jobs.some((j) => j.status === 'queued' || j.status === 'running')) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [jobs]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await fetch('/api/studio/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ templateId: tpl?.id ?? null, prompt, inputs, quality, images }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setError(typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
    else {
      setPrompt('');
      setImages([]);
      await refresh();
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      <div className="space-y-3">
        <div className="rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--line)' }}>
          <p style={{ color: 'var(--muted)' }}>可用點數</p>
          <p className="text-2xl font-bold">{credits.available}</p>
          <p style={{ color: 'var(--muted)' }}>
            持有 {credits.stored} · 保留中 {credits.reserved}
            {byok ? ' · BYOK 啟用中，生成不扣點' : ''}
          </p>
          <Link href="/member" className="underline">
            點數明細與金鑰
          </Link>
        </div>
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
          <p className="mb-2 text-xs font-semibold">模板庫</p>
          <ul className="space-y-1">
            <li>
              <button onClick={() => setTpl(null)} className={`w-full rounded px-2 py-1 text-left text-sm ${!tpl ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'}`}>
                自由提示詞
              </button>
            </li>
            {categories.map((cat) => (
              <li key={cat}>
                <p className="mt-2 px-2 text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>
                  {cat}
                </p>
                <ul className="space-y-1">
                  {templates
                    .filter((t) => t.category === cat)
                    .map((t) => (
                      <li key={t.id}>
                        <button onClick={() => (setTpl(t), setInputs({}), setImages([]))} className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${tpl?.id === t.id ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'}`}>
                          {t.coverUrl ? <img src={t.coverUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" /> : null}
                          <span className="min-w-0 flex-1 truncate">
                            {t.name}
                            <span className="ml-2 text-xs" style={{ color: tpl?.id === t.id ? '#d4d4d4' : 'var(--muted)' }}>
                              {t.defaultSize === '1024x1024' ? '1:1' : '2:3'}・{t.costPoints}/{t.highCostPoints} 點
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="space-y-4">
        <form onSubmit={submit} className="space-y-3 rounded-lg border p-4" style={{ borderColor: 'var(--line)' }}>
          <p className="text-sm font-semibold">{tpl ? tpl.name : '自由提示詞'}</p>
          {tpl?.description ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {tpl.description}
            </p>
          ) : null}
          {tpl?.coverUrl ? <img src={tpl.coverUrl} alt="" className="max-h-56 rounded border object-contain" style={{ borderColor: 'var(--line)' }} /> : null}
          {(tpl?.inputFields ?? []).map((f) => (
            <label key={f.key} className="block text-xs">
              {f.label}
              {f.required ? <span className="text-red-700"> *</span> : null}
              {f.type === 'image' ? (
                <div className="mt-1 space-y-1">
                  <input type="file" accept="image/*" multiple className="block text-xs" onChange={(e) => void addImages(e.target.files)} disabled={images.length >= 4} />
                  <p style={{ color: 'var(--muted)' }}>{f.placeholder ?? '最多 4 張、每張 10MB'}（{images.length}/4）</p>
                  {images.length ? (
                    <div className="flex flex-wrap gap-1">
                      {images.map((src, i) => (
                        <span key={i} className="relative">
                          <img src={src} alt="" className="h-16 w-16 rounded border object-cover" style={{ borderColor: 'var(--line)' }} />
                          <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 rounded-full bg-black px-1 text-[10px] text-white">
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : f.type === 'textarea' ? (
                <textarea className={input} style={{ borderColor: 'var(--line)' }} rows={2} placeholder={f.placeholder} value={inputs[f.key] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })} />
              ) : f.type === 'select' ? (
                <select className={input} style={{ borderColor: 'var(--line)' }} value={inputs[f.key] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })}>
                  <option value="">{f.placeholder ?? '請選擇'}</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input className={input} style={{ borderColor: 'var(--line)' }} placeholder={f.placeholder} value={inputs[f.key] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })} />
              )}
            </label>
          ))}
          <label className="block text-xs">
            {tpl ? '自由補充（風格、氛圍…可留空）' : '提示詞'}
            <textarea className={input} style={{ borderColor: 'var(--line)' }} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} required={!tpl} />
          </label>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input type="radio" checked={quality === 'standard'} onChange={() => setQuality('standard')} /> 標準（螢幕觀看・快）
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={quality === 'high'} onChange={() => setQuality('high')} /> 高品質・印刷（慢）
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={busy || (!byok && credits.available < cost)} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
              {busy ? '送出中…' : `生成（${cost} 點）`}
            </button>
            {!byok && credits.available < cost ? <span className="text-xs text-red-700">可用點數不足</span> : null}
            {error ? <span className="text-xs text-red-700">{error}</span> : null}
          </div>
        </form>
        <div className="rounded-lg border p-4" style={{ borderColor: 'var(--line)' }}>
          <p className="mb-2 text-sm font-semibold">生成記錄</p>
          {jobs.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {jobs.map((j) => (
                <li key={j.id} className="rounded-lg border p-2 text-xs" style={{ borderColor: 'var(--line)' }}>
                  {j.resultUrl ? <img src={j.resultUrl} alt="" className="mb-2 aspect-square w-full rounded object-cover" /> : <div className="mb-2 flex aspect-square w-full items-center justify-center rounded bg-neutral-100">{STATUS[j.status]}</div>}
                  <p className="font-semibold">{j.template?.name ?? '自由提示詞'}</p>
                  <p style={{ color: 'var(--muted)' }}>
                    {STATUS[j.status]} · {j.quality === 'high' ? '印刷' : '標準'} · {j.byok ? 'BYOK' : `${j.costPoints} 點`} · {fmtDateTime(j.createdAt)}
                  </p>
                  {j.error ? <p className="text-red-700">{j.error}</p> : null}
                  {j.status === 'queued' ? (
                    <button onClick={() => fetch(`/api/studio/jobs/${j.id}/cancel`, { method: 'POST' }).then(refresh)} className="mt-1 rounded border px-2 py-0.5" style={{ borderColor: 'var(--line)' }}>
                      取消（未產出不扣點）
                    </button>
                  ) : null}
                  {j.resultUrl ? (
                    <a href={j.resultUrl} download className="mt-1 inline-block underline">
                      下載
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              尚無生成記錄。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

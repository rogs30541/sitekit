'use client';

import { fmtDateTime } from '@/lib/api-public';
import { useEffect, useMemo, useState } from 'react';

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
const line = { borderColor: 'var(--line)' } as const;

/**
 * 工作站（對標 inShow generate）：上方模板庫（封面卡＋搜尋）→ 左「生成記錄」→ 右「生成配置」（生成／微調、標準／高品質、欄位、參考圖、必填提醒、範例參考）。
 */
type GalleryView = 'row' | 'two' | 'three' | 'list';
const GALLERY_VIEWS: { key: GalleryView; label: string; hint: string }[] = [
  { key: 'row', label: '單行', hint: '一行橫向捲動' },
  { key: 'two', label: '兩行', hint: '兩欄卡片' },
  { key: 'three', label: '三行', hint: '三欄卡片' },
  { key: 'list', label: '清單', hint: '純文字清單，不預覽圖片' },
];

/** API 產圖工作站（inShow 版面）：模板庫／生成記錄／生成配置；模型自動偵測後在此選擇，不顯示點數。 */
export function ImageStudio({ templates }: { templates: AiTemplate[] }) {
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [model, setModel] = useState('');
  const [detect, setDetect] = useState<{ loading: boolean; error?: string; providers?: string[] }>({ loading: false });
  const detectModels = async () => {
    setDetect({ loading: true });
    const j = await fetch('/api/admin/studio/models').then((r) => r.json()).catch(() => ({ models: [] }));
    setModels(j.models ?? []);
    setModel((cur) => (j.models?.some((m: { id: string }) => m.id === cur) ? cur : (j.default ?? '')));
    const errs = Object.values((j.errors ?? {}) as Record<string, string>);
    setDetect({ loading: false, error: errs.length ? errs.join('；') : undefined, providers: j.providers ?? [] });
  };
  useEffect(() => {
    void detectModels();
  }, []);
  const [tpl, setTpl] = useState<AiTemplate | null>(templates[0] ?? null);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'generate' | 'refine'>('generate');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState('');
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [images, setImages] = useState<string[]>([]);
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showExample, setShowExample] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(true);
  /** 模板庫預覽版型（使用者 2026-09-23 指定四種）；記在 localStorage 只是個人偏好 */
  const [view, setView] = useState<GalleryView>('row');
  useEffect(() => {
    try {
      const v = localStorage.getItem('sk.studio.galleryView') as GalleryView | null;
      if (v && GALLERY_VIEWS.some((x) => x.key === v)) setView(v);
    } catch {}
  }, []);
  const changeView = (v: GalleryView) => {
    setView(v);
    try {
      localStorage.setItem('sk.studio.galleryView', v);
    } catch {}
  };

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? templates.filter((t) => `${t.name} ${t.category} ${t.description ?? ''} ${t.key}`.toLowerCase().includes(k)) : templates;
  }, [templates, q]);
  const missing = (tpl?.inputFields ?? []).filter((f) => f.required && f.type !== 'image' && !inputs[f.key]?.trim()).map((f) => f.label);
  const needsImage = mode === 'refine' && !images.length;

  async function refresh() {
    const j = await fetch('/api/admin/studio/jobs?limit=60').then((r) => (r.ok ? r.json() : []));
    setJobs(j);
  }
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!jobs.some((j) => j.status === 'queued' || j.status === 'running')) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [jobs]);

  async function addImages(files: FileList | null) {
    if (!files) return;
    const next = [...images];
    for (const f of Array.from(files)) {
      if (next.length >= 4) break;
      if (f.size > 10 * 1024 * 1024) {
        setError('參考圖每張上限 10MB');
        continue;
      }
      next.push(
        await new Promise<string>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result));
          fr.onerror = () => rej(fr.error);
          fr.readAsDataURL(f);
        }),
      );
    }
    setImages(next);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing.length) return setError(`請填寫必填欄位：${missing.join('、')}`);
    if (needsImage) return setError('微調模式請先上傳參考圖');
    setBusy(true);
    setError('');
    const r = await fetch('/api/admin/studio/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ templateId: tpl?.id ?? null, prompt, inputs, quality, images, model: model || undefined }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setError(typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
    else {
      setPrompt('');
      await refresh();
    }
    setBusy(false);
  }
  function pick(t: AiTemplate | null) {
    setTpl(t);
    setInputs({});
    setImages([]);
    setError('');
  }

  return (
    <div className="space-y-3">
      {/* 模板庫 */}
      <section className="rounded-lg border p-3" style={line}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold">模板庫</h2>
          <input className={`${input} max-w-xs`} style={line} value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋模板、分類、用途" />
          <button type="button" onClick={() => pick(null)} className={`rounded border px-2 py-1 text-xs ${!tpl ? 'bg-black text-white' : ''}`} style={line}>
            自由提示詞
          </button>
          <span className="ml-auto flex items-center gap-1 text-xs">
            {GALLERY_VIEWS.map((v) => (
              <button key={v.key} type="button" onClick={() => changeView(v.key)} className={`rounded border px-2 py-1 ${view === v.key ? 'bg-black text-white' : ''}`} style={view === v.key ? undefined : line} title={v.hint}>
                {v.label}
              </button>
            ))}
            <button type="button" onClick={() => setGalleryOpen((o) => !o)} className="rounded border px-2 py-1" style={line}>
              {galleryOpen ? '收合' : '展開'}
            </button>
          </span>
        </div>
        {galleryOpen ? (
          <div className={view === 'row' ? 'flex gap-3 overflow-x-auto pb-2' : view === 'two' ? 'grid grid-cols-2 gap-3' : view === 'three' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3' : 'flex flex-col gap-2'}>
            {filtered.map((t) => {
              const ratio = t.defaultSize === '1024x1024' ? '1:1' : t.defaultSize === '1536x1024' ? '3:2' : '2:3';
              const title = t.name.replace(/^[A-E]\d{2} /, '');
              const desc = t.description?.split('（')[0];
              const selected = tpl?.id === t.id ? 'ring-2 ring-black' : '';
              if (view === 'list')
                return (
                  <article key={t.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-2 py-1 text-xs ${selected}`} style={line} onClick={() => pick(t)}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{title}</span>
                        <span style={{ color: 'var(--muted)' }}>{t.category}</span>
                        <span className="rounded bg-neutral-100 px-1">{ratio}</span>
                      </div>
                      <div className="truncate" style={{ color: 'var(--muted)' }}>
                        {desc}
                      </div>
                    </div>
                    <span className="shrink-0 underline">檢視</span>
                  </article>
                );
              return (
                <article key={t.id} className={`cursor-pointer rounded-lg border ${view === 'row' ? 'w-40 shrink-0' : 'w-full'} ${selected}`} style={line} onClick={() => pick(t)}>
                  {t.coverUrl ? <img src={t.coverUrl} alt="" className="aspect-[3/4] w-full rounded-t-lg object-cover" /> : <div className="aspect-[3/4] w-full rounded-t-lg bg-neutral-100" />}
                  <div className="p-2 text-xs">
                    <div style={{ color: 'var(--muted)' }}>{t.category}</div>
                    <div className="font-semibold">{title}</div>
                    <div className="line-clamp-2" style={{ color: 'var(--muted)' }}>
                      {desc}
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="rounded bg-neutral-100 px-1">{ratio}</span>
                      <span className="underline">檢視</span>
                    </div>
                  </div>
                </article>
              );
            })}
            {!filtered.length ? <p className="text-xs" style={{ color: 'var(--muted)' }}>沒有符合的模板。</p> : null}
          </div>
        ) : null}
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* 生成記錄 */}
        <section className="rounded-lg border p-3" style={line}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold">生成記錄</h2>
            <button type="button" onClick={() => void refresh()} className="rounded border px-2 py-0.5 text-xs" style={line}>
              重新整理
            </button>
          </div>
          {jobs.length ? (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {jobs.map((j) => (
                <li key={j.id} className="rounded-lg border p-2 text-xs" style={line}>
                  {j.resultUrl ? <img src={j.resultUrl} alt="" className="mb-2 aspect-square w-full rounded object-cover" /> : <div className="mb-2 flex aspect-square w-full items-center justify-center rounded bg-neutral-100">{STATUS[j.status]}</div>}
                  <p className="font-semibold">{j.template?.name ?? '自由提示詞'}</p>
                  <p style={{ color: 'var(--muted)' }}>
                    {STATUS[j.status]} · {j.quality === 'high' ? '高品質' : '標準'} · {j.size} · {fmtDateTime(j.createdAt)}
                  </p>
                  {j.error ? <p className="text-red-700">{j.error}</p> : null}
                  <div className="mt-1 flex gap-2">
                    {j.status === 'queued' ? (
                      <button onClick={() => fetch(`/api/admin/studio/jobs/${j.id}/cancel`, { method: 'POST' }).then(refresh)} className="rounded border px-2 py-0.5" style={line}>
                        取消
                      </button>
                    ) : null}
                    {j.resultUrl ? (
                      <>
                        <a href={j.resultUrl} download className="rounded border px-2 py-0.5 underline" style={line}>
                          下載
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setMode('refine');
                            setImages([j.resultUrl!]);
                          }}
                          className="rounded border px-2 py-0.5"
                          style={line}
                        >
                          以此圖微調
                        </button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex min-h-40 items-center justify-center rounded border border-dashed text-xs" style={{ ...line, color: 'var(--muted)' }}>
              {tpl?.coverUrl ? (
                <button type="button" onClick={() => setShowExample((s) => !s)} className="rounded border px-3 py-1" style={line}>
                  範例參考
                </button>
              ) : (
                '尚無生成記錄；在右側填好配置後按「生成」。'
              )}
            </div>
          )}
          {showExample && tpl?.coverUrl ? (
            <div className="mt-2 text-xs">
              <p className="mb-1" style={{ color: 'var(--muted)' }}>
                範例成品（{tpl.name}）
              </p>
              <img src={tpl.coverUrl} alt="" className="max-h-96 rounded border" style={line} />
            </div>
          ) : null}
        </section>

        {/* 生成配置 */}
        <form onSubmit={submit} className="space-y-2 rounded-lg border p-3 text-xs" style={line}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold">生成配置</h2>
              <p style={{ color: 'var(--muted)' }}>{tpl ? tpl.name : '自由提示詞'}</p>
            </div>
            <span className="rounded bg-neutral-100 px-2 py-0.5">API 產圖・{(detect.providers ?? []).map((p) => (p === 'openai' ? 'OpenAI' : p === 'gemini' ? 'Gemini' : 'mock 佔位')).join('＋') || '…'}</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" onClick={() => setMode('generate')} className={`rounded px-2 py-1.5 ${mode === 'generate' ? 'bg-black text-white' : 'border'}`} style={mode === 'generate' ? undefined : line}>
              生成
            </button>
            <button type="button" onClick={() => setMode('refine')} className={`rounded px-2 py-1.5 ${mode === 'refine' ? 'bg-black text-white' : 'border'}`} style={mode === 'refine' ? undefined : line} title="以參考圖為基礎微調">
              微調
            </button>
          </div>
          <label className="block">
            模型
            {detect.loading ? <span style={{ color: 'var(--muted)' }}>（偵測可用模型中…）</span> : detect.error ? <span className="text-red-700">（{detect.error}）</span> : models.length ? <span className="text-green-700">（已偵測 {models.length} 個）</span> : null}
            <span className="flex gap-1">
              <select className={input} style={line} value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
                {!models.length ? <option value="">（沿用設定的預設模型）</option> : null}
              </select>
              <button type="button" onClick={() => void detectModels()} className="shrink-0 rounded border px-2" style={line} title="重新偵測">
                ↻
              </button>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" onClick={() => setQuality('standard')} className={`rounded border p-2 text-left ${quality === 'standard' ? 'bg-black text-white' : ''}`} style={quality === 'standard' ? undefined : line}>
              <div className="font-semibold">標準</div>
              <div className="opacity-80">螢幕觀看・快</div>
            </button>
            <button type="button" onClick={() => setQuality('high')} className={`rounded border p-2 text-left ${quality === 'high' ? 'bg-black text-white' : ''}`} style={quality === 'high' ? undefined : line}>
              <div className="font-semibold">高品質・印刷</div>
              <div className="opacity-80">可印刷・慢</div>
            </button>
          </div>
          {(tpl?.inputFields ?? []).map((f) =>
            f.type === 'image' ? null : (
              <label key={f.key} className="block">
                {f.label}
                {f.required ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">必填</span> : null}
                {f.type === 'textarea' ? (
                  <textarea className={input} style={line} rows={3} placeholder={f.placeholder} value={inputs[f.key] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })} />
                ) : f.type === 'select' ? (
                  <select className={input} style={line} value={inputs[f.key] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })}>
                    <option value="">{f.placeholder ?? '請選擇'}</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className={input} style={line} placeholder={f.placeholder} value={inputs[f.key] ?? ''} onChange={(e) => setInputs({ ...inputs, [f.key]: e.target.value })} />
                )}
              </label>
            ),
          )}
          <label className="block">
            {tpl ? '自由補充' : '提示詞'}
            {!tpl ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">必填</span> : null}
            <textarea className={input} style={line} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={tpl ? '描述商品、材質、顏色與想要呈現的賣點。' : '描述想要的畫面'} required={!tpl} />
          </label>
          <div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer rounded border px-2 py-1" style={line}>
                商品圖／服務圖
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addImages(e.target.files)} disabled={images.length >= 4} />
              </label>
              {mode === 'refine' ? <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-800">必填</span> : null}
              <span style={{ color: 'var(--muted)' }}>最多 4 張，每張 10MB（{images.length}/4）</span>
            </div>
            {images.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {images.map((src, i) => (
                  <span key={i} className="relative">
                    <img src={src} alt="" className="h-14 w-14 rounded border object-cover" style={line} />
                    <button type="button" onClick={() => setImages(images.filter((_, k) => k !== i))} className="absolute -right-1 -top-1 rounded-full bg-black px-1 text-[10px] text-white">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          {missing.length ? <p className="rounded bg-amber-50 px-2 py-1 text-amber-900">請填寫必填欄位：{missing.join('、')}</p> : null}
          {error ? <p className="text-red-700">{error}</p> : null}
          <button type="submit" disabled={busy} className="w-full rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? '送出中…' : mode === 'refine' ? '微調' : '生成'}
          </button>
          {tpl?.coverUrl ? (
            <button type="button" onClick={() => setShowExample((s) => !s)} className="w-full rounded border px-2 py-1" style={line}>
              {showExample ? '隱藏範例參考' : '範例參考'}
            </button>
          ) : null}
          <p style={{ color: 'var(--muted)' }}>API 產圖只支援 OpenAI 與 Gemini（Claude 不產圖）；到「指令台 → 設定」填金鑰後，模型清單自動偵測。產出可用於商品封面、頁面設計與 Banner。</p>
        </form>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { HomeSection } from '@/lib/site';

const KINDS: { kind: HomeSection['kind']; label: string; make: () => HomeSection }[] = [
  { kind: 'hero', label: '主視覺（標題＋副標＋按鈕）', make: () => ({ kind: 'hero', title: '歡迎來到我們的網站', subtitle: '一句話說明你提供的價值', ctaText: '看課程', ctaHref: '/courses', imageUrl: '', align: 'center' }) },
  { kind: 'features', label: '特色三欄', make: () => ({ kind: 'features', title: '為什麼選我們', items: [{ title: '特色一', text: '', icon: '✨' }, { title: '特色二', text: '', icon: '🚀' }, { title: '特色三', text: '', icon: '💡' }] }) },
  { kind: 'courses', label: '精選課程（自動）', make: () => ({ kind: 'courses', title: '精選課程', limit: 3 }) },
  { kind: 'products', label: '熱門商品（自動）', make: () => ({ kind: 'products', title: '熱門商品', limit: 3 }) },
  { kind: 'posts', label: '最新文章（自動）', make: () => ({ kind: 'posts', title: '最新文章', limit: 3 }) },
  { kind: 'html', label: '自訂 HTML', make: () => ({ kind: 'html', title: '', html: '<p>自訂內容</p>' }) },
  { kind: 'cta', label: '行動呼籲（色塊）', make: () => ({ kind: 'cta', title: '準備好開始了嗎？', text: '', buttonText: '立即加入', buttonHref: '/register' }) },
];
const input = 'w-full rounded border px-2 py-1 text-sm';

/** 首頁版面區塊：新增／上下移／刪除／編輯欄位，整組 PUT /api/admin/site/home（伺服器端 zod 驗證）。 */
export function HomeSectionsEditor({ initial }: { initial: HomeSection[] }) {
  const [sections, setSections] = useState<HomeSection[]>(initial);
  const [add, setAdd] = useState<HomeSection['kind']>('hero');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const upd = (i: number, patch: Partial<HomeSection>) => setSections((s) => s.map((x, k) => (k === i ? ({ ...x, ...patch } as HomeSection) : x)));
  const move = (i: number, d: -1 | 1) =>
    setSections((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const c = [...s];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  async function save() {
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/admin/site/home', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sections }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? '已儲存首頁版面。' : `失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
    if (r.ok) setSections(j as HomeSection[]);
  }
  const F = ({ i, k, label, textarea }: { i: number; k: keyof HomeSection; label: string; textarea?: boolean }) => (
    <label className="block text-xs">
      {label}
      {textarea ? (
        <textarea className={input} style={{ borderColor: 'var(--line)' }} rows={3} value={String(sections[i][k] ?? '')} onChange={(e) => upd(i, { [k]: e.target.value } as Partial<HomeSection>)} />
      ) : (
        <input className={input} style={{ borderColor: 'var(--line)' }} value={String(sections[i][k] ?? '')} onChange={(e) => upd(i, { [k]: e.target.value } as Partial<HomeSection>)} />
      )}
    </label>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={add} onChange={(e) => setAdd(e.target.value as HomeSection['kind'])} className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }}>
          {KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <button onClick={() => setSections((s) => [...s, KINDS.find((k) => k.kind === add)!.make()])} className="rounded border px-3 py-1" style={{ borderColor: 'var(--line)' }}>
          ＋ 新增區塊
        </button>
        <button onClick={save} disabled={busy} className="rounded bg-black px-4 py-1.5 text-white disabled:opacity-50">
          儲存首頁版面
        </button>
        {msg ? <span className="text-xs">{msg}</span> : null}
      </div>
      {!sections.length ? (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          尚無區塊：首頁會顯示 slug=home 的頁面內容或預設內容。
        </p>
      ) : null}
      <ol className="space-y-3">
        {sections.map((s, i) => (
          <li key={i} className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span className="font-semibold">
                {i + 1}. {KINDS.find((k) => k.kind === s.kind)?.label ?? s.kind}
              </span>
              <button onClick={() => move(i, -1)} className="rounded border px-2" style={{ borderColor: 'var(--line)' }}>
                ↑
              </button>
              <button onClick={() => move(i, 1)} className="rounded border px-2" style={{ borderColor: 'var(--line)' }}>
                ↓
              </button>
              <button onClick={() => setSections((x) => x.filter((_, k) => k !== i))} className="text-red-700 underline">
                刪除
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {s.kind === 'hero' ? (
                <>
                  <F i={i} k="title" label="標題" />
                  <F i={i} k="subtitle" label="副標" />
                  <F i={i} k="ctaText" label="按鈕文字" />
                  <F i={i} k="ctaHref" label="按鈕連結（/courses 或 https://…）" />
                  <F i={i} k="imageUrl" label="圖片網址" />
                  <label className="block text-xs">
                    對齊
                    <select className={input} style={{ borderColor: 'var(--line)' }} value={s.align ?? 'center'} onChange={(e) => upd(i, { align: e.target.value as 'left' | 'center' })}>
                      <option value="center">置中</option>
                      <option value="left">靠左</option>
                    </select>
                  </label>
                </>
              ) : null}
              {s.kind === 'features' ? (
                <>
                  <F i={i} k="title" label="標題" />
                  <div className="sm:col-span-2 space-y-1">
                    {(s.items ?? []).map((f, k) => (
                      <div key={k} className="flex flex-wrap gap-1 text-xs">
                        <input className="w-12 rounded border px-1" style={{ borderColor: 'var(--line)' }} placeholder="圖示" value={f.icon ?? ''} onChange={(e) => upd(i, { items: s.items!.map((x, m) => (m === k ? { ...x, icon: e.target.value } : x)) })} />
                        <input className="w-40 rounded border px-1" style={{ borderColor: 'var(--line)' }} placeholder="特色標題" value={f.title} onChange={(e) => upd(i, { items: s.items!.map((x, m) => (m === k ? { ...x, title: e.target.value } : x)) })} />
                        <input className="flex-1 rounded border px-1" style={{ borderColor: 'var(--line)' }} placeholder="說明" value={f.text ?? ''} onChange={(e) => upd(i, { items: s.items!.map((x, m) => (m === k ? { ...x, text: e.target.value } : x)) })} />
                        <button onClick={() => upd(i, { items: s.items!.filter((_, m) => m !== k) })} className="text-red-700 underline">
                          刪
                        </button>
                      </div>
                    ))}
                    <button onClick={() => upd(i, { items: [...(s.items ?? []), { title: '新特色', text: '', icon: '' }] })} className="text-xs underline">
                      ＋ 加一項
                    </button>
                  </div>
                </>
              ) : null}
              {s.kind === 'courses' || s.kind === 'products' || s.kind === 'posts' ? (
                <>
                  <F i={i} k="title" label="標題" />
                  <label className="block text-xs">
                    顯示數量
                    <input className={input} style={{ borderColor: 'var(--line)' }} type="number" min={1} max={12} value={s.limit ?? 3} onChange={(e) => upd(i, { limit: Number(e.target.value) || 3 })} />
                  </label>
                </>
              ) : null}
              {s.kind === 'html' ? (
                <>
                  <F i={i} k="title" label="標題（可空）" />
                  <div className="sm:col-span-2">
                    <F i={i} k="html" label="HTML" textarea />
                  </div>
                </>
              ) : null}
              {s.kind === 'cta' ? (
                <>
                  <F i={i} k="title" label="標題" />
                  <F i={i} k="text" label="說明" />
                  <F i={i} k="buttonText" label="按鈕文字" />
                  <F i={i} k="buttonHref" label="按鈕連結" />
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

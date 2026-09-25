'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SalesTemplateSummary, TemplateCategory } from '@sitekit/shared';

/**
 * 一頁式網頁套版庫：五分類 × 5 風格配色 ＝ 25 套；選一套＋標題 → apply_sales_template（建立草稿）→ 進編輯器。
 * 與指令台「用模板建立銷售頁」、MCP sitekit_apply_sales_template 同一套動作。
 */
type ListResp = { categories: { id: TemplateCategory; label: string; desc?: string }[]; templates: SalesTemplateSummary[] };
const act = async <T,>(action: string, params: Record<string, unknown> = {}) => {
  const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, params }) });
  const b = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: T; message?: string };
  if (!r.ok || b.ok === false) throw new Error(b.error ?? b.message ?? `HTTP ${r.status}`);
  return b.data as T;
};
const BLOCK_LABEL: Record<string, string> = { hero: '主張', trust: '信任帶', pain: '痛點', authority: '權威', promise: '承諾', formula: '公式', module: '模組', offer: '優惠', testimonials: '見證', products: '商品／場次', faq: 'FAQ', closing: '收尾', story: '故事', features: '特色', steps: '流程', solution: '解法', cases: '案例', about: '關於', contents: '內容', services: '服務' };

/** 線框縮圖：依區塊序列畫色帶，主色／背景取自配色 */
function Wire({ t }: { t: SalesTemplateSummary }) {
  const P = t.palette;
  return (
    <div className="flex h-36 w-full flex-col gap-[3px] overflow-hidden rounded-md border p-1.5" style={{ background: P.bg, borderColor: P.border }} aria-hidden>
      {t.blocks.slice(0, 9).map((b, i) => {
        const hero = b === 'hero';
        const band = hero ? `linear-gradient(135deg, ${P.heroFrom}, ${P.heroTo})` : b === 'offer' || b === 'closing' ? P.surface : 'transparent';
        return (
          <div key={i} className={`flex items-center gap-1 rounded-sm px-1 ${hero ? 'h-8' : 'h-3'}`} style={{ background: band }}>
            {hero ? (
              <div className="flex w-full flex-col items-center gap-1">
                <span className="h-1.5 w-1/2 rounded-sm" style={{ background: P.dark ? '#fff' : P.text }} />
                <span className="h-2 w-8 rounded-sm" style={{ background: P.primary }} />
              </div>
            ) : ['pain', 'module', 'steps', 'features', 'services', 'contents', 'testimonials', 'cases'].includes(b) ? (
              [0, 1, 2].map((k) => <span key={k} className="h-full flex-1 rounded-sm" style={{ background: P.surface, border: `1px solid ${P.border}` }} />)
            ) : (
              <>
                <span className="h-1 w-1/4 rounded-sm" style={{ background: P.muted }} />
                <span className="h-1 flex-1 rounded-sm opacity-60" style={{ background: P.muted }} />
                {b === 'offer' || b === 'closing' ? <span className="h-1.5 w-5 rounded-sm" style={{ background: P.primary }} /> : null}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SalesTemplatePicker() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ListResp | null>(null);
  const [cat, setCat] = useState<TemplateCategory>('course');
  const [pick, setPick] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!open || data) return;
    act<ListResp>('list_sales_templates').then(setData).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [open, data]);
  async function apply() {
    if (!pick || !title.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const r = await act<{ id: string }>('apply_sales_template', { id: pick, title: title.trim(), confirm: true });
      router.push(`/admin/sales/${r.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  const list = data?.templates.filter((t) => t.category === cat) ?? [];
  const picked = data?.templates.find((t) => t.id === pick);
  return (
    <>
      <button onClick={() => setOpen((o) => !o)} className="rounded border px-3 py-1" style={{ borderColor: 'var(--line)' }} data-sales-templates>
        從套版建立（25 套）
      </button>
      {open ? (
        <div className="mt-3 w-full rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
          <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
            一頁式網頁套版：五分類各 5 種風格配色。骨架依課程銷售頁分析（主張 → 信任帶 → 痛點 → 權威 → 承諾 → 公式 → 模組 → 優惠 → 見證 → 商品／場次 → FAQ → 收尾）反推各分類；文案與圖片為佔位，建立後在編輯器填入、掛上商品，再預覽發佈。
          </p>
          {err ? <p className="mb-2 text-xs text-red-700">{err}</p> : null}
          {!data ? <p className="text-xs" style={{ color: 'var(--muted)' }}>載入中…</p> : null}
          {data ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                {data.categories.map((c) => (
                  <button key={c.id} onClick={() => setCat(c.id)} className={`rounded-full border px-3 py-1 text-xs ${cat === c.id ? 'bg-black text-white' : ''}`} style={cat === c.id ? undefined : { borderColor: 'var(--line)' }}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {list.map((t) => (
                  <button key={t.id} type="button" onClick={() => setPick(t.id)} className={`rounded-xl border p-2 text-left transition hover:shadow ${pick === t.id ? 'ring-2 ring-black' : ''}`} style={{ borderColor: 'var(--line)', background: 'var(--card)' }} data-sales-template={t.id}>
                    <Wire t={t} />
                    <div className="mt-2 flex items-center gap-2">
                      <span className="inline-flex gap-0.5">
                        <span className="h-3 w-3 rounded-full border" style={{ background: t.palette.primary, borderColor: 'var(--line)' }} />
                        <span className="h-3 w-3 rounded-full border" style={{ background: t.palette.accent, borderColor: 'var(--line)' }} />
                        <span className="h-3 w-3 rounded-full border" style={{ background: t.palette.bg, borderColor: 'var(--line)' }} />
                      </span>
                      <span className="truncate font-semibold">{t.style}</span>
                    </div>
                  </button>
                ))}
              </div>
              {picked ? (
                <div className="mt-3 space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
                  <p className="font-semibold">
                    {picked.name} <span className="text-xs font-normal" style={{ color: 'var(--muted)' }}>{picked.id}</span>
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{picked.blocks.map((b) => BLOCK_LABEL[b] ?? b).join(' → ')}</p>
                  {picked.source ? <p className="text-xs" style={{ color: 'var(--muted)' }}>結構來源：{picked.source}</p> : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="min-w-0 flex-1 rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--line)' }} placeholder="銷售頁標題（必填）" value={title} onChange={(e) => setTitle(e.target.value)} />
                    <button disabled={busy || !title.trim()} onClick={() => void apply()} className="rounded bg-black px-4 py-1.5 text-white disabled:opacity-50" data-sales-apply>
                      {busy ? '建立中…' : '建立草稿並編輯'}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import type { SiteTemplateSummary, TemplateCategory } from '@sitekit/shared';
import { QuickSetupPanel } from './QuickSetupPanel';

/**
 * 套版庫（後台「網站 → 套版庫」與安裝精靈「版型」步驟共用）：
 * 五大分類頁籤 → 版型卡片（線框縮圖＝首頁區塊序列、主題色、風格、子頁）→ 套用（confirm=true）／還原。
 * 全部走 /api/admin/ai/act（list_site_templates／apply_site_template），與 MCP 同一套 OPS 動作。
 */
type ListResp = { categories: { id: TemplateCategory; label: string; desc?: string }[]; templates: SiteTemplateSummary[]; current: { id: string; appliedAt: string; hasBackup: boolean } };
const act = async <T,>(action: string, params: Record<string, unknown> = {}) => {
  const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, params }) });
  const b = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: T; message?: string };
  if (!r.ok || b.ok === false) throw new Error(b.error ?? b.message ?? `HTTP ${r.status}`);
  return b.data as T;
};

/** 線框縮圖：每個首頁區塊畫成一條色帶（依 kind 決定高度／內容形狀；tone 決定底色） */
export function Wireframe({ kinds, accent, dark }: { kinds: string[]; accent: string; dark: boolean }) {
  const bg = dark ? '#111114' : '#ffffff';
  const fg = dark ? '#3a3a42' : '#d4d4d8';
  const soft = dark ? '#1c1c21' : '#f1f1f3';
  return (
    <div className="flex h-36 w-full flex-col gap-[3px] overflow-hidden rounded-md border p-1.5" style={{ background: bg, borderColor: dark ? '#26262b' : '#e5e7eb' }} aria-hidden>
      <div className="flex h-2 items-center justify-between px-1"><span className="h-1 w-6 rounded-sm" style={{ background: fg }} /><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-1 w-3 rounded-sm" style={{ background: fg }} />)}</span></div>
      {kinds.slice(0, 7).map((k, i) => {
        // homeKinds 形如 kind[:variant][@tone]（例 hero:carousel@dark、cta@accent）
        const m = /^([a-z]+)(?::([a-z]+))?(?:@([a-z]+))?$/.exec(k);
        const kind = m?.[1] ?? k;
        const rest = m?.[2] ?? '';
        const tone = m?.[3] ?? '';
        const band = tone === 'accent' ? accent : tone === 'dark' || tone === 'image' ? '#0b0b0d' : tone === 'muted' ? soft : 'transparent';
        const dot = tone === 'accent' || tone === 'dark' || tone === 'image' ? 'rgba(255,255,255,.55)' : fg;
        const h = kind === 'hero' ? 'h-9' : kind === 'banner' ? 'h-1.5' : kind === 'cta' || kind === 'stats' || kind === 'logos' ? 'h-3' : 'h-5';
        const cols = ['features', 'gallery', 'courses', 'products', 'posts', 'team', 'testimonials', 'pricing', 'steps', 'categories', 'stats'].includes(kind) ? (kind === 'gallery' || kind === 'products' ? 4 : 3) : kind === 'split' ? 2 : 0;
        return (
          <div key={i} className={`flex ${h} items-center gap-1 rounded-sm px-1`} style={{ background: band }}>
            {kind === 'hero' ? (
              <div className={`flex w-full ${rest.startsWith('split') || rest.startsWith('left') ? 'items-center gap-1' : 'flex-col items-center justify-center gap-1'}`}>
                <span className="h-1.5 w-1/3 rounded-sm" style={{ background: tone ? dot : accent }} />
                <span className="h-1 w-1/2 rounded-sm" style={{ background: dot }} />
                {rest.startsWith('split') ? <span className="ml-auto h-6 w-1/3 rounded-sm" style={{ background: soft }} /> : null}
              </div>
            ) : cols ? (
              Array.from({ length: cols }, (_, c) => <span key={c} className="h-full flex-1 rounded-sm" style={{ background: tone === 'accent' || tone === 'dark' || tone === 'image' ? 'rgba(255,255,255,.18)' : soft, border: `1px solid ${tone ? 'transparent' : fg}` }} />)
            ) : kind === 'cta' ? (
              <><span className="h-1 w-1/3 rounded-sm" style={{ background: dot }} /><span className="ml-auto h-1.5 w-6 rounded-sm" style={{ background: tone === 'accent' ? '#fff' : accent }} /></>
            ) : (
              <><span className="h-1 w-1/4 rounded-sm" style={{ background: dot }} /><span className="h-1 flex-1 rounded-sm opacity-60" style={{ background: dot }} /></>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TemplateGallery({ onApplied, compact }: { onApplied?: (id: string) => void; compact?: boolean }) {
  const [data, setData] = useState<ListResp | null>(null);
  const [cat, setCat] = useState<TemplateCategory | 'all'>('all');
  const [pick, setPick] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = async () => {
    try {
      setData(await act<ListResp>('list_site_templates'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    void load();
  }, []);

  async function apply(id: string) {
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      const r = await act<{ name: string; pages: string[]; homeSections: number }>('apply_site_template', { id, confirm: true });
      setMsg(`已套用「${r.name}」：首頁 ${r.homeSections} 個區塊、子頁 ${r.pages.join('、') || '無'}。前台約 60 秒內更新（ISR）。`);
      await load();
      onApplied?.(id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!confirm('還原套版前的主題、首頁區塊與選單？（套版建立的子頁會保留）')) return;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      await act('apply_site_template', { id: data?.current.id || 'restore', confirm: true, restore: true });
      setMsg('已還原套版前的主題／首頁／選單。');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (err && !data) return <p className="text-sm text-red-700">載入套版失敗：{err}</p>;
  if (!data) return <p className="text-sm" style={{ color: 'var(--muted)' }}>載入套版庫…</p>;
  const list = data.templates.filter((t) => cat === 'all' || t.category === cat);
  const picked = list.find((t) => t.id === pick) ?? data.templates.find((t) => t.id === pick);
  return (
    <div className="space-y-3 text-sm">
      <QuickSetupPanel
        onDone={(id) => {
          void load();
          onApplied?.(id);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        {[{ id: 'all' as const, label: `全部 ${data.templates.length}` }, ...data.categories].map((c) => (
          <button key={c.id} onClick={() => setCat(c.id as TemplateCategory | 'all')} className={`rounded-full border px-3 py-1 text-xs ${cat === c.id ? 'bg-black text-white' : ''}`} style={cat === c.id ? undefined : { borderColor: 'var(--line)' }}>
            {c.label}
          </button>
        ))}
        <span className="flex-1" />
        {data.current.id ? (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            目前版型：<b>{data.templates.find((t) => t.id === data.current.id)?.name ?? data.current.id}</b>
            {data.current.hasBackup ? (
              <button onClick={restore} disabled={busy} className="ml-2 underline disabled:opacity-50">
                還原套版前
              </button>
            ) : null}
          </span>
        ) : (
          <span className="text-xs" style={{ color: 'var(--muted)' }}>尚未套用版型</span>
        )}
      </div>
      {msg ? <p className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{msg}</p> : null}
      {err ? <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-800">{err}</p> : null}
      <div className={`grid gap-3 ${compact ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
        {list.map((t) => {
          const dark = t.theme?.mode === 'dark';
          const accent = t.theme?.accent ?? '#171717';
          const active = t.id === data.current.id;
          return (
            <button key={t.id} type="button" onClick={() => setPick(t.id)} className={`rounded-xl border p-2 text-left transition hover:shadow ${pick === t.id ? 'ring-2 ring-black' : ''}`} style={{ borderColor: active ? accent : 'var(--line)', background: 'var(--card)' }} data-template={t.id}>
              <Wireframe kinds={t.homeKinds} accent={accent} dark={!!dark} />
              <div className="mt-2 flex items-start gap-2">
                <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full border" style={{ background: accent, borderColor: 'var(--line)' }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {t.name}
                    {active ? <span className="ml-1 rounded bg-black px-1 text-[10px] text-white">使用中</span> : null}
                  </p>
                  <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>{t.style}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {picked ? (
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
          <div className="flex flex-wrap items-start gap-4">
            <div className="w-56 shrink-0">
              <Wireframe kinds={picked.homeKinds} accent={picked.theme?.accent ?? '#171717'} dark={picked.theme?.mode === 'dark'} />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-base font-bold">
                {picked.name} <span className="text-xs font-normal" style={{ color: 'var(--muted)' }}>{picked.id}</span>
              </p>
              <p style={{ color: 'var(--muted)' }}>{picked.tagline}</p>
              <p className="text-xs">
                風格：{picked.style}｜主題：{picked.theme?.mode === 'dark' ? '深色' : '淺色'}／{picked.theme?.font}／圓角 {picked.theme?.radius}／頁首 {picked.theme?.header}／頁尾 {picked.theme?.footer}
              </p>
              <p className="text-xs">首頁區塊：{picked.homeKinds.map((k) => k.split('@')[0]).join(' → ')}</p>
              <p className="text-xs">主選單：{picked.headerMenu.join('／')}｜子頁：{picked.pages.join('、') || '無'}</p>
              {picked.tags?.length ? <p className="text-xs" style={{ color: 'var(--muted)' }}>#{picked.tags.join(' #')}</p> : null}
              {picked.source ? <p className="text-xs" style={{ color: 'var(--muted)' }}>版型結構參考：{picked.source}</p> : null}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button onClick={() => void apply(picked.id)} disabled={busy} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50" data-apply={picked.id}>
                  {busy ? '套用中…' : '套用這個版型'}
                </button>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>會覆寫主題、首頁區塊、選單並建立同名子頁；商品／課程／文章／品牌資料不動，可一鍵還原。</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

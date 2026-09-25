'use client';

import { useState } from 'react';

/**
 * 一鍵建站（後台套版庫與安裝精靈共用）：填品牌名稱／行業／風格／聯絡資料 → 系統推薦版型（recommend_site_template）→ 確認後 quick_setup_site
 * （套版＋品牌資料寫進區塊＋品牌設定＋主題）。與指令台「幫我建站」、MCP sitekit_quick_setup_site 同一套動作。
 */
type Pick = { id: string; name: string; category: string; style: string; tagline: string; tags: string[]; pages: string[]; score: number };
const act = async <T,>(action: string, params: Record<string, unknown>) => {
  const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, params }) });
  const b = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: T; message?: string };
  if (!r.ok || b.ok === false) throw new Error(b.error ?? b.message ?? `HTTP ${r.status}`);
  return b.data as T;
};
const input = 'w-full rounded border px-2 py-1.5 text-sm';
const line = { borderColor: 'var(--line)' } as const;
const CATS: [string, string][] = [['', '讓系統依行業判斷'], ['image', '形象'], ['shop', '電商'], ['course', '課程'], ['brand', '品牌'], ['service', '專業服務']];

export function QuickSetupPanel({ onDone }: { onDone?: (templateId: string) => void }) {
  const [v, setV] = useState({ brandName: '', tagline: '', industry: '', style: '', category: '', contactEmail: '', phone: '', mode: '' });
  const [rec, setRec] = useState<{ category?: string; picked: Pick | null; alternatives: Pick[] } | null>(null);
  const [chosen, setChosen] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  async function recommend() {
    setBusy(true);
    setErr('');
    try {
      const r = await act<{ category?: string; picked: Pick | null; alternatives: Pick[] }>('recommend_site_template', { industry: v.industry, style: v.style, ...(v.category ? { category: v.category } : {}) });
      setRec(r);
      setChosen(r.picked?.id ?? '');
      if (!r.picked) setErr('找不到適合的版型，請選一個分類再試。');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function setup() {
    if (!chosen) return;
    if (!confirm('會套用版型並覆寫主題、首頁區塊、選單與同名子頁，並把你填的品牌資料寫進站台（可一鍵還原）。確定？')) return;
    setBusy(true);
    setErr('');
    try {
      const r = await act<{ template: { name: string }; pages: string[]; brandUpdated: string[]; next: string[] }>('quick_setup_site', { confirm: true, templateId: chosen, brandName: v.brandName || undefined, tagline: v.tagline || undefined, industry: v.industry || undefined, style: v.style || undefined, contactEmail: v.contactEmail || undefined, phone: v.phone || undefined, mode: v.mode || undefined });
      setMsg(`已完成：版型「${r.template.name}」、子頁 ${r.pages.join('、') || '無'}、品牌設定 ${r.brandUpdated.length} 項。下一步：${r.next.join('；')}`);
      onDone?.(chosen);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const list = rec ? [rec.picked, ...rec.alternatives].filter((x): x is Pick => !!x) : [];
  return (
    <div className="rounded-xl border p-4 text-sm" style={{ ...line, background: 'var(--card)' }} data-quick-setup>
      <p className="font-semibold">一鍵建站：填品牌與行業，讓系統挑版型並把資料寫進站台</p>
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>只會用你填的內容（品牌名稱寫進首頁小標、標語寫進副標、Email／電話寫進聯絡區塊），其餘文案仍是佔位，之後在「首頁版面」或 AI 工作站補。不產圖。</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input className={input} style={line} placeholder="品牌名稱（必填）" value={v.brandName} onChange={(e) => setV({ ...v, brandName: e.target.value })} />
        <input className={input} style={line} placeholder="行業（例：手工烘焙坊、線上英文課）" value={v.industry} onChange={(e) => setV({ ...v, industry: e.target.value })} />
        <input className={input} style={line} placeholder="風格（例：簡潔、深色、溫暖）" value={v.style} onChange={(e) => setV({ ...v, style: e.target.value })} />
        <select className={input} style={line} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>
          {CATS.map(([id, label]) => (
            <option key={id} value={id}>
              分類：{label}
            </option>
          ))}
        </select>
        <input className={input} style={line} placeholder="標語（選填）" value={v.tagline} onChange={(e) => setV({ ...v, tagline: e.target.value })} />
        <input className={input} style={line} placeholder="聯絡 Email（選填）" value={v.contactEmail} onChange={(e) => setV({ ...v, contactEmail: e.target.value })} />
        <input className={input} style={line} placeholder="電話（選填）" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        <select className={input} style={line} value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value })}>
          <option value="">深淺色：依版型</option>
          <option value="light">淺色</option>
          <option value="dark">深色</option>
        </select>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button disabled={busy || (!v.industry && !v.category)} onClick={() => void recommend()} className="rounded border px-3 py-1.5 disabled:opacity-50" style={line}>
          {busy ? '處理中…' : '推薦版型'}
        </button>
        {list.length ? (
          <select className="rounded border px-2 py-1.5 text-sm" style={line} value={chosen} onChange={(e) => setChosen(e.target.value)} data-quick-pick>
            {list.map((t, i) => (
              <option key={t.id} value={t.id}>
                {i === 0 ? '推薦：' : '備選：'}
                {t.name}（{t.style}）
              </option>
            ))}
          </select>
        ) : null}
        {chosen ? (
          <button disabled={busy || !v.brandName.trim()} onClick={() => void setup()} className="rounded bg-black px-4 py-1.5 text-white disabled:opacity-50" data-quick-apply>
            套用並寫入品牌資料
          </button>
        ) : null}
      </div>
      {rec?.picked ? <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>推薦理由：分類「{rec.category ?? '全部'}」、{rec.picked.tagline}；標籤 #{rec.picked.tags.join(' #')}</p> : null}
      {msg ? <p className="mt-2 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{msg}</p> : null}
      {err ? <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-800">{err}</p> : null}
    </div>
  );
}

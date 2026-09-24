'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { DEFAULT_THEME, THEME_KEYS, type Theme } from '@sitekit/shared';

/**
 * 外觀主題（theme.*）：套版會一次寫入，這裡可逐項微調——深淺色、第二主色、字型、圓角、頁首／頁尾樣式、內容寬度、標題粗細。
 * 主色在上方「網站設定 → 主色」（brand.primaryColor）調整；走 update_settings（與 MCP 同一動作）。
 */
const OPTS: Record<Exclude<keyof Theme, 'accent' | 'accent2'>, [string, string][]> = {
  mode: [['light', '淺色'], ['dark', '深色']],
  font: [['sans', '黑體（預設）'], ['serif', '明體／襯線'], ['display', '展示體（粗標題）'], ['rounded', '圓體'], ['mono', '等寬']],
  radius: [['none', '直角'], ['sm', '小圓角'], ['md', '中圓角（預設）'], ['xl', '大圓角'], ['full', '膠囊']],
  header: [['solid', '實底'], ['transparent', '透明'], ['centered', '置中'], ['minimal', '極簡'], ['bar', '主色底線']],
  footer: [['simple', '三欄（預設）'], ['columns', '四欄'], ['minimal', '單列']],
  container: [['narrow', '窄（56rem）'], ['normal', '一般（72rem）'], ['wide', '寬（88rem）']],
  heading: [['normal', '一般'], ['bold', '粗'], ['display', '特粗緊排']],
};
const LABELS: Record<keyof typeof OPTS, string> = { mode: '深淺色', font: '字型', radius: '圓角', header: '頁首樣式', footer: '頁尾樣式', container: '內容寬度', heading: '標題粗細' };

export function ThemeSettingsForm({ initial, currentTemplate }: { initial: Partial<Theme>; currentTemplate?: string }) {
  const router = useRouter();
  const [v, setV] = useState<Theme>({ ...DEFAULT_THEME, ...initial });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const settings: Record<string, string> = {};
    for (const [k, key] of Object.entries(THEME_KEYS)) if (k !== 'accent') settings[key] = String((v as Record<string, string>)[k] ?? '');
    const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update_settings', params: { settings } }) });
    const j = await r.json().catch(() => ({}));
    setMsg(j.ok ? '已儲存主題，前台 60 秒內更新。' : `失敗：${j.error ?? r.status}`);
    setBusy(false);
    router.refresh();
  }
  const sel = 'w-full rounded border px-2 py-1 text-sm';
  const line = { borderColor: 'var(--line)' } as const;
  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {currentTemplate ? <>目前版型：<b>{currentTemplate}</b>。</> : '尚未套用版型。'}
        {' 想整套換請到 '}
        <Link href="/admin/site/templates" className="underline">
          套版庫
        </Link>
        {'；主色請在上方「主色」欄調整。'}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(OPTS) as (keyof typeof OPTS)[]).map((k) => (
          <label key={k} className="block text-xs">
            {LABELS[k]}
            <select className={sel} style={line} value={String(v[k])} onChange={(e) => setV({ ...v, [k]: e.target.value } as Theme)}>
              {OPTS[k].map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="block text-xs">
          第二主色（漸層用，可空）
          <span className="flex items-center gap-2">
            <input type="color" value={v.accent2 || v.accent} onChange={(e) => setV({ ...v, accent2: e.target.value })} className="h-8 w-10 cursor-pointer rounded border" style={line} />
            <input className={sel} style={line} value={v.accent2 ?? ''} placeholder="#rrggbb" onChange={(e) => setV({ ...v, accent2: e.target.value })} />
            {v.accent2 ? (
              <button type="button" className="text-xs underline" onClick={() => setV({ ...v, accent2: '' })}>
                清除
              </button>
            ) : null}
          </span>
        </label>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <button onClick={save} disabled={busy} className="rounded bg-black px-4 py-1.5 text-white disabled:opacity-50">
          儲存主題
        </button>
        {msg ? <span className="text-xs">{msg}</span> : null}
      </div>
    </div>
  );
}

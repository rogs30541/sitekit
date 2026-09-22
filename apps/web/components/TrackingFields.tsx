'use client';

import { TRACKING_EVENT_FIELDS, TRACKING_ID_FIELDS, type TrackingConfig } from '@sitekit/shared';

const input = 'w-full rounded border px-2 py-1 text-sm';
const line = { borderColor: 'var(--line)' } as const;

/**
 * 追蹤碼表單（對標 1shop 追蹤頁：分析設定／自訂程式碼／購物車事件）。
 * 網站設定、頁面設計器（設定面板）、銷售頁「追蹤」分頁共用；頁面層級留空＝沿用網站設定。
 */
export function TrackingFields({ value, onChange, compact = false, inherit = false }: { value: TrackingConfig; onChange: (v: TrackingConfig) => void; compact?: boolean; inherit?: boolean }) {
  const set = (k: keyof TrackingConfig, v: string) => onChange({ ...value, [k]: v });
  const setEv = (k: keyof TrackingConfig['events'], v: string) => onChange({ ...value, events: { ...value.events, [k]: v } });
  const Wrap = ({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) =>
    compact ? (
      <details className="rounded border p-2" style={line} open={title === '分析設定'}>
        <summary className="cursor-pointer text-xs font-semibold">{title}</summary>
        <p className="mb-1 text-[11px]" style={{ color: 'var(--muted)' }}>
          {desc}
        </p>
        <div className="space-y-1">{children}</div>
      </details>
    ) : (
      <div className="rounded-lg border p-3" style={{ ...line, background: 'var(--card)' }}>
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
          {desc}
        </p>
        <div className="space-y-2">{children}</div>
      </div>
    );
  return (
    <div className={compact ? 'space-y-1' : 'grid gap-3 lg:grid-cols-2'}>
      <Wrap title="分析設定" desc={`開啟 Google／Meta／TikTok／LINE 追蹤後，會把頁面狀態回傳該平台，讓你依資料調整廣告受眾。自動事件：PageView（瀏覽）、ViewContent（看到產品）、AddToCart（加入購物車）、InitiateCheckout（開始結帳）、Purchase（完成訂單），附 pageId／pageTitle／value／currency。${inherit ? ' 留空＝沿用網站設定；填了則覆蓋。' : ''}`}>
        {TRACKING_ID_FIELDS.map((f) => (
          <label key={f.key} className="block text-xs">
            {f.label}
            <input className={`${input} font-mono`} style={line} value={value[f.key]} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
            {!compact ? (
              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                {f.help}
              </span>
            ) : null}
          </label>
        ))}
      </Wrap>
      <Wrap title="自訂程式碼" desc="在 Head 內／Body 最上方／Body 最下方插入 HTML（可含 script）。請注意！語法錯誤可能造成頁面無法使用，使用前務必測試。">
        {(['head', 'bodyTop', 'bodyBottom'] as const).map((k) => (
          <label key={k} className="block text-xs">
            {{ head: 'Head 內', bodyTop: 'Body 最上方', bodyBottom: 'Body 最下方' }[k]}
            <textarea className={`${input} font-mono`} style={line} rows={compact ? 2 : 4} value={value[k]} onChange={(e) => set(k, e.target.value)} placeholder="請輸入 HTML 語法" />
          </label>
        ))}
      </Wrap>
      <Wrap title="購物車事件（JavaScript）" desc="在各事件觸發時執行你的 JavaScript（不要貼 HTML）。可用變數：page、product、qty、value、currency、items、order。">
        {TRACKING_EVENT_FIELDS.map((f) => (
          <label key={f.key} className="block text-xs">
            {f.label}
            <textarea className={`${input} font-mono`} style={line} rows={compact ? 2 : 3} value={value.events[f.key]} onChange={(e) => setEv(f.key, e.target.value)} placeholder="請輸入 JavaScript 語法" />
            {!compact ? (
              <span className="text-[11px]" style={{ color: 'var(--muted)' }}>
                {f.help}
              </span>
            ) : null}
          </label>
        ))}
      </Wrap>
    </div>
  );
}

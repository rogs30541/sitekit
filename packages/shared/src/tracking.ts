/**
 * 追蹤碼設定（對標 1shop「追蹤」頁）：網站層級（網站設定）＋頁面層級（頁面設計文件 settings.tracking／銷售頁 doc.tracking）。
 * 前台：GTM／GA4／Meta Pixel／TikTok Pixel／LINE Tag／Google Ads 轉換＋自訂 Head／Body 程式碼＋購物車事件 JS。
 * 自動事件：PageView、ViewContent、AddToCart、InitiateCheckout、Purchase（附 pageId／pageTitle／value／currency）。
 */
export interface TrackingEvents {
  pageView: string;
  viewContent: string;
  addToCart: string;
  initiateCheckout: string;
  purchase: string;
  /** 滑動事件（區塊進入可視／頁面深度）JS；變數 event、percent、block、page */
  scroll: string;
}
/** 頁面滑動深度：percents 例 [25,50,75,100]，到達即送 event（預設 scroll_depth） */
export interface ScrollTracking {
  enabled: boolean;
  percents: number[];
  event: string;
}
export interface TrackingConfig {
  ga4: string;
  gtm: string;
  fbPixel: string;
  tiktok: string;
  lineTag: string;
  /** Google Ads 轉換：AW-XXXX / 標籤 */
  googleAdsId: string;
  googleAdsLabel: string;
  head: string;
  bodyTop: string;
  bodyBottom: string;
  events: TrackingEvents;
  scroll: ScrollTracking;
}
export const TRACKING_ID_FIELDS: { key: keyof Omit<TrackingConfig, 'events' | 'head' | 'bodyTop' | 'bodyBottom' | 'scroll'>; label: string; placeholder: string; help: string }[] = [
  { key: 'gtm', label: 'Google Tag Manager', placeholder: 'GTM-XXXXXXX', help: '啟用後由 GTM 統一管理標籤；會在 head 載入並補 noscript' },
  { key: 'ga4', label: 'Google Analytics 4', placeholder: 'G-XXXXXXXXXX', help: '量測 ID；自動送 page_view／view_item／add_to_cart／begin_checkout／purchase' },
  { key: 'fbPixel', label: 'Meta（Facebook）Pixel', placeholder: '1234567890', help: '自動追蹤 PageView／ViewContent／AddToCart／InitiateCheckout／Purchase' },
  { key: 'tiktok', label: 'TikTok Pixel', placeholder: 'CXXXXXXXXXXXXXXX', help: '自動 track ViewContent／AddToCart／InitiateCheckout／CompletePayment' },
  { key: 'lineTag', label: 'LINE Tag', placeholder: 'xxxxxxxx-xxxx-xxxx', help: 'LINE Ads Platform 基本代碼；轉換事件自動送 AddToCart／Purchase' },
  { key: 'googleAdsId', label: 'Google Ads 轉換 ID', placeholder: 'AW-XXXXXXXXX', help: '訂單成立時送轉換（購買）' },
  { key: 'googleAdsLabel', label: 'Google Ads 轉換標籤', placeholder: 'abcDEFghiJKL', help: '搭配轉換 ID' },
];
export const TRACKING_EVENT_FIELDS: { key: keyof TrackingEvents; label: string; help: string }[] = [
  { key: 'pageView', label: '瀏覽頁面 PageView', help: '可用變數 page（{id,title,type}）' },
  { key: 'viewContent', label: '查看產品 ViewContent', help: '滑動至看到產品時；變數 items' },
  { key: 'addToCart', label: '加入購物車 AddToCart', help: '變數 product、qty、value、currency' },
  { key: 'initiateCheckout', label: '開始結帳 InitiateCheckout', help: '變數 value、currency、items' },
  { key: 'purchase', label: '訂單成立 Purchase', help: '變數 order（{no,amount,items}）、value、currency' },
  { key: 'scroll', label: '滑動事件（區塊可視／頁面深度）', help: '變數 event（事件名）、percent（可視或深度百分比）、block（區塊標籤，頁面深度時為空）、page' },
];
export const DEFAULT_SCROLL_PERCENTS = [25, 50, 75, 100];
export const EVENT_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
export const defaultScrollTracking = (): ScrollTracking => ({ enabled: true, percents: [...DEFAULT_SCROLL_PERCENTS], event: 'scroll_depth' });
/** 正規化滑動設定：百分比 1–100 整數、去重排序、最多 20 個；事件名 GA4 規則（字母開頭、底線／數字、≤40） */
export function normalizeScroll(input: unknown): ScrollTracking {
  const d = defaultScrollTracking();
  if (!input || typeof input !== 'object') return d;
  const o = input as Record<string, unknown>;
  if (typeof o.enabled === 'boolean') d.enabled = o.enabled;
  const raw = Array.isArray(o.percents) ? o.percents : typeof o.percents === 'string' ? o.percents.split(/[,，\s]+/) : null;
  if (raw) d.percents = [...new Set(raw.map((x) => Math.round(Number(x))).filter((x) => Number.isFinite(x) && x >= 1 && x <= 100))].sort((a, b) => a - b).slice(0, 20);
  const ev = typeof o.event === 'string' ? o.event.trim() : '';
  d.event = EVENT_NAME_RE.test(ev) ? ev : 'scroll_depth';
  return d;
}

export const defaultTracking = (): TrackingConfig => ({ ga4: '', gtm: '', fbPixel: '', tiktok: '', lineTag: '', googleAdsId: '', googleAdsLabel: '', head: '', bodyTop: '', bodyBottom: '', events: { pageView: '', viewContent: '', addToCart: '', initiateCheckout: '', purchase: '', scroll: '' }, scroll: defaultScrollTracking() });

const ID_RE: Record<string, RegExp> = { ga4: /^G-[A-Z0-9]{4,20}$/i, gtm: /^GTM-[A-Z0-9]{4,12}$/i, fbPixel: /^\d{6,20}$/, tiktok: /^[A-Z0-9]{8,40}$/i, lineTag: /^[a-z0-9-]{8,64}$/i, googleAdsId: /^AW-\d{6,15}$/i, googleAdsLabel: /^[A-Za-z0-9_-]{4,64}$/ };
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** 正規化（未知鍵丟棄、ID 格式不符則清空、程式碼欄位長度上限） */
export function normalizeTracking(input: unknown): TrackingConfig {
  const d = defaultTracking();
  if (!input || typeof input !== 'object') return d;
  const o = input as Record<string, unknown>;
  for (const k of ['ga4', 'gtm', 'fbPixel', 'tiktok', 'lineTag', 'googleAdsId', 'googleAdsLabel'] as const) {
    const v = str(o[k], 80);
    d[k] = v && ID_RE[k].test(v) ? v : '';
  }
  for (const k of ['head', 'bodyTop', 'bodyBottom'] as const) d[k] = str(o[k], 20000);
  const ev = (o.events && typeof o.events === 'object' ? o.events : {}) as Record<string, unknown>;
  for (const k of ['pageView', 'viewContent', 'addToCart', 'initiateCheckout', 'purchase', 'scroll'] as const) d.events[k] = str(ev[k], 5000);
  d.scroll = normalizeScroll(o.scroll);
  return d;
}

/** 頁面層級覆蓋網站層級：ID 有值才覆蓋；程式碼與事件 JS 串接（網站先、頁面後） */
export function mergeTracking(site: TrackingConfig, page?: Partial<TrackingConfig> | null): TrackingConfig {
  if (!page) return site;
  const p = normalizeTracking(page);
  const out = { ...site, events: { ...site.events } };
  for (const k of ['ga4', 'gtm', 'fbPixel', 'tiktok', 'lineTag', 'googleAdsId', 'googleAdsLabel'] as const) if (p[k]) out[k] = p[k];
  for (const k of ['head', 'bodyTop', 'bodyBottom'] as const) out[k] = [site[k], p[k]].filter(Boolean).join('\n');
  for (const k of ['pageView', 'viewContent', 'addToCart', 'initiateCheckout', 'purchase', 'scroll'] as const) out.events[k] = [site.events[k], p.events[k]].filter(Boolean).join('\n;\n');
  // 頁面有明確給 scroll 才覆蓋（銷售頁／設計頁可設不同深度）
  out.scroll = page.scroll !== undefined ? p.scroll : site.scroll;
  return out;
}
export const hasTracking = (t: TrackingConfig) => !!(t.ga4 || t.gtm || t.fbPixel || t.tiktok || t.lineTag || t.googleAdsId || t.head || t.bodyTop || t.bodyBottom || Object.values(t.events ?? {}).some(Boolean));

/** 公開內容用（ISR）：不帶 cookie，可在建置期執行；api 不在線時回 null 而不讓建置失敗。 */
import { effectivePrice } from '@sitekit/shared';
import { apiFetch } from './api-fetch';

export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export async function apiPublic<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    // 10 秒逾時：建置期（靜態產生）或 api 冷啟動時不讓整個 build／請求掛住，逾時一律回 null 走後備
    const res = await apiFetch(`${API_INTERNAL_URL}${path}`, { next: { revalidate }, headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface PostSummary {
  slug: string;
  title: string;
  excerpt: string | null;
  coverUrl: string | null;
  author: string | null;
  tags: string[];
  publishedAt: string | null;
  updatedAt: string;
}
export interface PostDetail extends PostSummary {
  body: string | null;
  canonicalUrl: string | null;
}
export interface PostList {
  items: PostSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface VideoRef {
  provider: 'youtube' | 'bunny';
  id: string;
}
export interface CourseSummary {
  id: string;
  slug: string;
  summary: string | null;
  product: { id: string; name: string; description: string | null; coverUrl: string | null; price: number; salePrice?: number | null; saleStartsAt?: string | null; saleEndsAt?: string | null; tags?: string[]; category?: string | null };
  instructorName?: string | null;
  _count: { chapters: number };
}
export interface Chapter {
  id: string;
  parentId: string | null;
  order: number;
  title: string;
  durationSec: number | null;
  isPreview: boolean;
  hasVideo?: boolean;
}
export interface ChapterNode extends Chapter {
  children: ChapterNode[];
}
export interface CourseDetail {
  id: string;
  slug: string;
  summary: string | null;
  product: { id: string; name: string; description: string | null; coverUrl: string | null; price: number; salePrice?: number | null; saleStartsAt?: string | null; saleEndsAt?: string | null; tags?: string[]; category?: string | null; isActive: boolean };
  instructorName?: string | null;
  instructorBio?: string | null;
  purchaseNote?: string | null;
  buttonText?: string | null;
  chapters: Chapter[];
  coverVideo: VideoRef | null;
  previewVideo: VideoRef | null;
  accessMode: 'unlimited' | 'days' | 'until';
  accessDays: number | null;
  accessUntil: string | null;
  entitled?: boolean;
  expiresAt?: string | null;
  progress?: Record<string, { positionSec: number; completed: boolean }>;
  summaryProgress?: { total: number; done: number; percent: number };
}

/** 扁平章節 → 兩層樹（根層可當單元容器） */
export function buildTree<T extends Chapter>(chapters: T[]): (T & { children: T[] })[] {
  const byParent = new Map<string | null, T[]>();
  for (const ch of chapters) {
    const k = ch.parentId ?? null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(ch);
  }
  const sortOrder = (a: T, b: T) => a.order - b.order;
  return (byParent.get(null) ?? []).sort(sortOrder).map((root) => ({ ...root, children: (byParent.get(root.id) ?? []).sort(sortOrder) }));
}

/** 教室播放順序：根層依序，遇到有子章節就先走子章節 */
export function flattenPlayable<T extends Chapter>(chapters: T[]): T[] {
  const out: T[] = [];
  for (const root of buildTree(chapters)) {
    if (root.hasVideo !== false) out.push(root);
    for (const c of root.children) out.push(c);
  }
  return out;
}

export interface Product {
  id: string;
  type: 'physical' | 'course' | 'credit_pack';
  sku: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  price: number;
  salePrice?: number | null;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  tags?: string[];
  stock?: number | null;
  category?: string | null;
  specs?: { name: string; values: string[] }[] | null;
  variants?: { id: string; name: string; sku: string; price: number | null; stock: number | null; options: Record<string, string> }[];
  course?: { slug: string } | null;
}
export interface OrderItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
}
export interface Order {
  id: string;
  merchantOrderNo: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled';
  amount: number;
  subtotal?: number;
  discount?: number;
  couponCode?: string | null;
  shippingFee?: number;
  shippingName?: string | null;
  shippingPhone?: string | null;
  shippingAddress?: string | null;
  shippingStatus?: string | null;
  carrier?: string | null;
  trackingNo?: string | null;
  shippedAt?: string | null;
  shippingMethod?: string | null;
  cvsStoreId?: string | null;
  cvsStoreName?: string | null;
  cvsStoreAddress?: string | null;
  logisticsId?: string | null;
  logisticsPaymentNo?: string | null;
  logisticsStatus?: string | null;
  invoiceType?: string | null;
  invoiceTaxId?: string | null;
  invoices?: { number: string | null; status: string; provider: string }[];
  provider: string | null;
  paymentType: string | null;
  paidAt: string | null;
  virtualAccount: string | null;
  expireAt: string | null;
  refundStatus: string | null;
  createdAt: string;
  items: OrderItem[];
  user?: { email: string; displayName: string | null };
}

export const twd = (n: number) => `NT$ ${n.toLocaleString('zh-TW')}`;
export const fmtDuration = (sec: number | null | undefined) => {
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h} 時 ${m} 分` : `${m} 分`;
};

/**
 * 固定台北時區、24 小時制，且**不用 toLocaleString 直接輸出**：Node 與 Chrome 的 ICU 版本在日期與時間之間會輸出不同空白
 * （U+202F／U+00A0／一般空白），看起來一樣卻讓 hydration 失敗（v0.16.0 會員資料庫實測）；改用 formatToParts 自組固定格式。
 */
const TZ = { timeZone: "Asia/Taipei", hour12: false } as const;
const partsOf = (d: Date, withTime: boolean) => {
  const p = new Intl.DateTimeFormat("en-US", { ...TZ, year: "numeric", month: "2-digit", day: "2-digit", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { y: get("year"), m: get("month"), d: get("day"), h: hour, mi: get("minute") };
};
export const fmtDateTime = (iso: string | Date | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const { y, m, d: dd, h, mi } = partsOf(d, true);
  return `${y}/${m}/${dd} ${h}:${mi}`;
};
export const fmtDate = (iso: string | Date | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const { y, m, d: dd } = partsOf(d, false);
  return `${y}/${m}/${dd}`;
};

/** 價格顯示：特價中顯示「特價＋刪除線原價」 */
export function priceParts(p: { price: number; salePrice?: number | null; saleStartsAt?: string | null; saleEndsAt?: string | null }) {
  return effectivePrice(p);
}

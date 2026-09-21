/** 公開內容用（ISR）：不帶 cookie，可在建置期執行；api 不在線時回 null 而不讓建置失敗。 */
export const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export async function apiPublic<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}${path}`, { next: { revalidate }, headers: { accept: 'application/json' } });
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
  product: { id: string; name: string; description: string | null; coverUrl: string | null; price: number };
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
  product: { id: string; name: string; description: string | null; coverUrl: string | null; price: number; isActive: boolean };
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

/** 固定台北時區、24 小時制：SSR 與瀏覽器輸出一致，避免 hydration 不一致 */
const TZ = { timeZone: "Asia/Taipei", hour12: false } as const;
export const fmtDateTime = (iso: string | Date | null | undefined) => (iso ? new Date(iso).toLocaleString("zh-TW", { ...TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
export const fmtDate = (iso: string | Date | null | undefined) => (iso ? new Date(iso).toLocaleDateString("zh-TW", { ...TZ, year: "numeric", month: "2-digit", day: "2-digit" }) : "");

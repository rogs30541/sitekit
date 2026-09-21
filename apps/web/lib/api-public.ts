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

export interface CourseSummary {
  id: string;
  slug: string;
  summary: string | null;
  product: { id: string; name: string; description: string | null; coverUrl: string | null; price: number };
  _count: { chapters: number };
}
export interface Chapter {
  id: string;
  order: number;
  title: string;
  durationSec: number | null;
  isPreview: boolean;
  hasVideo?: boolean;
}
export interface CourseDetail {
  id: string;
  slug: string;
  summary: string | null;
  product: { id: string; name: string; description: string | null; coverUrl: string | null; price: number; isActive: boolean };
  chapters: Chapter[];
  entitled?: boolean;
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

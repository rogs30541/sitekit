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

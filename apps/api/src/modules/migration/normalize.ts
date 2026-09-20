/** 正規化內容模型：所有連接器輸出統一成這個型別，再進 contents 表。 */
export interface CanonicalContent {
  source: string;
  externalId: string;
  type: string;
  title: string;
  slug: string;
  body: string | null;
  excerpt: string | null;
  coverUrl: string | null;
  author: string | null;
  tags: string[];
  publishedAt: Date | null;
  originalUrl: string | null;
  raw?: unknown;
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#39;': "'", '&#8217;': '’', '&#8216;': '‘', '&#8220;': '“', '&#8221;': '”', '&nbsp;': ' ', '&hellip;': '…', '&#8230;': '…' };

export function decodeEntities(s: string): string {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? m);
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** 只移除可執行內容；保留原文 HTML 結構供前端渲染。 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

/** slug：保留 Unicode 字母數字，空白轉連字號；空值退回 externalId。 */
export function slugify(input: string, fallback: string): string {
  const s = decodeEntities(input)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return (s || fallback).slice(0, 120);
}

export function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function pathOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, '') || '/';
  } catch {
    return null;
  }
}

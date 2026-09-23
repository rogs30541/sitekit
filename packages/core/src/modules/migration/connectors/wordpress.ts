import { type CanonicalContent, decodeEntities, sanitizeHtml, slugify, stripTags, toDate } from '../normalize';

interface WpPost {
  id: number;
  date_gmt?: string;
  slug?: string;
  link?: string;
  title?: { rendered?: string };
  content?: { rendered?: string };
  excerpt?: { rendered?: string };
  _embedded?: {
    author?: { name?: string }[];
    'wp:featuredmedia'?: { source_url?: string }[];
    'wp:term'?: { name?: string }[][];
  };
}

/** WordPress REST 連接器：/wp-json/wp/v2/posts，分頁抓到 limit 或抓完為止。 */
export async function fetchWordPress(sourceUrl: string, limit = 200): Promise<CanonicalContent[]> {
  const base = sourceUrl.replace(/\/+$/, '');
  const out: CanonicalContent[] = [];
  const perPage = Math.min(100, limit);
  for (let page = 1; out.length < limit; page++) {
    const url = `${base}/wp-json/wp/v2/posts?status=publish&_embed=1&per_page=${perPage}&page=${page}`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (res.status === 400 && page > 1) break; // WP 回 400 代表超過最後一頁
    if (!res.ok) throw new Error(`WordPress ${res.status} at ${url}`);
    const posts = (await res.json()) as WpPost[];
    if (!Array.isArray(posts) || posts.length === 0) break;
    for (const p of posts) {
      const title = decodeEntities(p.title?.rendered ?? '').trim() || `post-${p.id}`;
      out.push({
        source: 'wordpress',
        externalId: String(p.id),
        type: 'post',
        title,
        slug: slugify(p.slug ? decodeURIComponent(p.slug) : title, `wp-${p.id}`),
        body: p.content?.rendered ? sanitizeHtml(p.content.rendered) : null,
        excerpt: p.excerpt?.rendered ? stripTags(p.excerpt.rendered).slice(0, 300) : null,
        coverUrl: p._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null,
        author: p._embedded?.author?.[0]?.name ?? null,
        tags: (p._embedded?.['wp:term'] ?? []).flat().map((t) => t?.name).filter((n): n is string => !!n),
        publishedAt: toDate(p.date_gmt ? p.date_gmt + 'Z' : null),
        originalUrl: p.link ?? null,
        raw: { id: p.id, link: p.link },
      });
      if (out.length >= limit) break;
    }
    if (posts.length < perPage) break;
  }
  return out;
}

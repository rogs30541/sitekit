import type { MetadataRoute } from 'next';
import { apiPublic, SITE_URL, type PostList } from '@/lib/api-public';

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ['', '/about', '/blog', '/store', '/courses'].map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.7 }));
  const posts = await apiPublic<PostList>('/api/content/posts?limit=50', 300);
  const postRoutes = (posts?.items ?? []).map((p) => ({ url: `${SITE_URL}/blog/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'monthly' as const, priority: 0.6 }));
  return [...staticRoutes, ...postRoutes];
}

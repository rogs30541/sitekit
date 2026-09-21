import type { MetadataRoute } from 'next';
import { apiPublic, SITE_URL, type CourseSummary, type PostList } from '@/lib/api-public';

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = ['', '/blog', '/store', '/courses'].map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.7 }));
  const [posts, pages, courses] = await Promise.all([apiPublic<PostList>('/api/content/posts?limit=50', 300), apiPublic<{ slug: string; updatedAt: string }[]>('/api/content/pages', 300), apiPublic<CourseSummary[]>('/api/catalog/courses', 300)]);
  const postRoutes = (posts?.items ?? []).map((p) => ({ url: `${SITE_URL}/blog/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'monthly' as const, priority: 0.6 }));
  const pageRoutes = (pages ?? []).filter((p) => p.slug !== 'home').map((p) => ({ url: `${SITE_URL}/p/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'monthly' as const, priority: 0.7 }));
  const courseRoutes = (courses ?? []).map((c) => ({ url: `${SITE_URL}/course/${c.slug}`, changeFrequency: 'weekly' as const, priority: 0.8 }));
  return [...staticRoutes, ...pageRoutes, ...courseRoutes, ...postRoutes];
}

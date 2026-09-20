import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/api-public';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/member', '/api'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

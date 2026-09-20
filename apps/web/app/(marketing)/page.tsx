import Link from 'next/link';
import { BRAND } from '@sitekit/shared';
import { Section } from '@/components/Section';
import { apiPublic, type PostList } from '@/lib/api-public';

export const revalidate = 60;

export default async function HomePage() {
  const posts = await apiPublic<PostList>('/api/content/posts?limit=3');
  return (
    <div className="space-y-6">
      <Section title={BRAND.siteName} group="(marketing)">
        <p>{BRAND.description}。預渲染加 ISR，SEO 主戰場。</p>
      </Section>
      <Section title="最新文章" group="(marketing)">
        {posts?.items.length ? (
          <ul className="space-y-2">
            {posts.items.map((p) => (
              <li key={p.slug}>
                <Link href={`/blog/${p.slug}`} className="font-semibold hover:underline">
                  {p.title}
                </Link>
                {p.excerpt ? <p style={{ color: 'var(--muted)' }}>{p.excerpt}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: 'var(--muted)' }}>尚無文章（api 未啟動或尚未匯入內容）。</p>
        )}
      </Section>
    </div>
  );
}

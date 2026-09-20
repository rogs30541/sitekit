import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiPublic, type PostList } from '@/lib/api-public';

export const revalidate = 60;
export const metadata = { title: '文章', description: '最新文章與知識庫' };

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page = '1' } = await searchParams;
  const data = await apiPublic<PostList>(`/api/content/posts?page=${encodeURIComponent(page)}&limit=20`);
  const items = data?.items ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  return (
    <Section title="文章" group="(marketing)">
      {items.length ? (
        <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
          {items.map((p) => (
            <li key={p.slug} className="py-3">
              <Link href={`/blog/${p.slug}`} className="text-base font-semibold hover:underline">
                {p.title}
              </Link>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('zh-TW') : ''} {p.author ? `· ${p.author}` : ''} {p.tags.length ? `· ${p.tags.join(', ')}` : ''}
              </p>
              {p.excerpt ? <p className="mt-1">{p.excerpt}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: 'var(--muted)' }}>尚無文章。</p>
      )}
      {pages > 1 ? (
        <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
          第 {data?.page} / {pages} 頁
          {(data?.page ?? 1) < pages ? (
            <>
              {' · '}
              <Link href={`/blog?page=${(data?.page ?? 1) + 1}`} className="underline">
                下一頁
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </Section>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSite } from '@/lib/site';
import { apiPublic, SITE_URL, type PostDetail, fmtDate } from '@/lib/api-public';

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

async function getPost(slug: string) {
  return apiPublic<PostDetail>(`/api/content/posts/${encodeURIComponent(slug)}`);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: '找不到文章' };
  const url = `${SITE_URL}/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    alternates: { canonical: url },
    openGraph: { title: post.title, description: post.excerpt ?? undefined, url, type: 'article', images: post.coverUrl ? [post.coverUrl] : undefined },
  };
}

export default async function PostPage({ params }: Params) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.coverUrl ?? undefined,
    author: post.author ? { '@type': 'Person', name: post.author } : undefined,
    publisher: { '@type': 'Organization', name: (await getSite()).brand.siteName },
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt,
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
  };
  return (
    <article className="rounded-xl border p-6" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/blog" className="underline">
          文章
        </Link>
        {' / '}
        {post.publishedAt ? fmtDate(post.publishedAt) : ''} {post.author ? `· ${post.author}` : ''}
      </p>
      <h1 className="mt-1 text-2xl font-bold">{post.title}</h1>
      {post.coverUrl ? <img src={post.coverUrl} alt="" className="mt-4 max-h-80 w-full rounded-lg object-cover" /> : null}
      <div className="prose mt-4 max-w-none text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: post.body ?? '' }} />
      {post.tags.length ? (
        <p className="mt-6 text-xs" style={{ color: 'var(--muted)' }}>
          標籤：{post.tags.join('、')}
        </p>
      ) : null}
    </article>
  );
}

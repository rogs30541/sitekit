import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiPublic, type PostList } from '@/lib/api-public';
import { HomeSections } from '@/components/HomeSections';
import { getSite } from '@/lib/site';
import { DesignBody } from '@/components/DesignBody';

interface PageDoc {
  slug: string;
  title: string;
  body: string | null;
  hasDesign?: boolean;
}

export const revalidate = 60;

export default async function HomePage() {
  const [posts, home, site] = await Promise.all([apiPublic<PostList>('/api/content/posts?limit=3'), apiPublic<PageDoc>('/api/content/pages/home'), getSite()]);
  if (home?.hasDesign && home.body) return <DesignBody html={home.body} />;
  if (site.home.sections.length) return <HomeSections sections={site.home.sections} />;
  return (
    <div className="space-y-6">
      {home?.body ? (
        <Section title={home.title || site.brand.siteName} group="(marketing)">
          <article className="prose max-w-none" dangerouslySetInnerHTML={{ __html: home.body }} />
        </Section>
      ) : (
        <Section title={site.brand.siteName} group="(marketing)">
          <p>{site.brand.description}</p>
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            到後台「網站設定 → 首頁版面」加入區塊，或在「內容編輯」建立 slug 為 home 的頁面並發布，即可取代這段預設內容。
          </p>
        </Section>
      )}
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

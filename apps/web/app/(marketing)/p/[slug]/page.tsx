import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Section } from '@/components/Section';
import { apiPublic } from '@/lib/api-public';
import { DesignBody } from '@/components/DesignBody';
import { Tracking } from '@/components/Tracking';
import { getSite } from '@/lib/site';
import type { TrackingConfig } from '@sitekit/shared';
import { t } from '@/lib/i18n';

export const revalidate = 60;

interface PageDoc {
  slug: string;
  title: string;
  body: string | null;
  excerpt: string | null;
  coverUrl: string | null;
  updatedAt: string;
  hasDesign?: boolean;
  version?: number;
  tracking?: Partial<TrackingConfig> | null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await apiPublic<PageDoc>(`/api/content/pages/${encodeURIComponent(slug)}`);
  return page ? { title: page.title, description: page.excerpt ?? undefined, alternates: { canonical: `/p/${slug}` } } : { title: t('找不到頁面') };
}

/** 官網自訂頁面（後台內容編輯器 type=page） */
export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await apiPublic<PageDoc>(`/api/content/pages/${encodeURIComponent(slug)}`);
  if (!page) notFound();
  const site = await getSite();
  const track = <Tracking config={page.tracking ?? null} site={site.tracking} scope="page" page={{ id: page.slug, title: page.title, type: 'page' }} />;
  if (page.hasDesign)
    return (
      <>
        {track}
        <DesignBody html={page.body ?? ''} />
      </>
    );
  return (
    <Section title={page.title} group="(marketing)">
      {track}
      {page.coverUrl ? <img src={page.coverUrl} alt="" className="mb-4 w-full rounded-lg object-cover" /> : null}
      <article className="prose max-w-none" dangerouslySetInnerHTML={{ __html: page.body ?? '' }} />
    </Section>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { API_INTERNAL_URL } from '@/lib/api-public';
import { DesignBody } from '@/components/DesignBody';
import { Section } from '@/components/Section';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '沙盒預覽（草稿）', robots: { index: false, follow: false } };

interface PreviewDoc {
  id: string;
  type: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverUrl: string | null;
  hasDesign: boolean;
  body: string;
  updatedAt: string;
  liveVersion: number;
  liveStatus: string;
}

/** 沙盒預覽：讀「草稿」（HMAC token，2 小時），不影響線上頁；可把連結交給測試者。 */
export default async function PreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token = '' } = await searchParams;
  let doc: PreviewDoc | null = null;
  try {
    const r = await fetch(`${API_INTERNAL_URL}/api/content/preview/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (r.status === 401) {
      return (
        <Section title={t('預覽連結無效或已過期')} group="(marketing)">
          <p>{t('請回後台「頁面設計」重新產生沙盒預覽連結（每個連結 2 小時有效）。')}</p>
        </Section>
      );
    }
    if (r.ok) doc = (await r.json()) as PreviewDoc;
  } catch {
    doc = null;
  }
  if (!doc) notFound();
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <span>
          <strong>{t('沙盒預覽')}</strong>：這是「草稿」內容，尚未發佈，線上頁面不受影響。草稿更新於 {new Date(doc.updatedAt).toLocaleString('zh-TW')}
          {doc.liveStatus === 'published' ? `；線上目前為第 ${doc.liveVersion} 版` : t('；此頁尚未上線')}
        </span>
        <span className="font-mono">{doc.type === 'page' ? (doc.slug === 'home' ? '/' : `/p/${doc.slug}`) : `/blog/${doc.slug}`}</span>
      </div>
      {doc.hasDesign ? (
        <DesignBody html={doc.body} />
      ) : (
        <Section title={doc.title} group="(marketing)">
          {doc.coverUrl ? <img src={doc.coverUrl} alt="" className="mb-4 w-full rounded-lg object-cover" /> : null}
          <article className="prose max-w-none" dangerouslySetInnerHTML={{ __html: doc.body }} />
        </Section>
      )}
    </div>
  );
}

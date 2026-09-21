import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { ContentEditor, type ContentDoc } from './ContentEditor';

export const dynamic = 'force-dynamic';

export default async function AdminContentEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await apiServer<ContentDoc>(`/api/admin/content/${encodeURIComponent(id)}`);
  if (!doc) notFound();
  return (
    <Section title={doc.type === 'page' ? '編輯頁面' : '編輯文章'} group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href={`/admin/content?type=${doc.type}`} className="underline">
          回列表
        </Link>
      </p>
      <ContentEditor doc={doc} />
    </Section>
  );
}

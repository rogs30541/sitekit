import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiServer } from '@/lib/api-server';
import { PageStudio, type DraftPayload } from './PageStudio';

export const dynamic = 'force-dynamic';

/** 頁面工作台：讀草稿（沒有就從線上版複製）；一切修改只進草稿，發佈需確認。 */
export default async function AdminContentEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await apiServer<DraftPayload>(`/api/admin/content/${encodeURIComponent(id)}/draft`);
  if (!draft) notFound();
  return (
    <div>
      <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href={`/admin/content?type=${draft.content.type}`} className="underline">
          回{draft.content.type === 'page' ? '頁面設計' : '文章'}列表
        </Link>
        {draft.content.status === 'published' ? (
          <>
            {' · '}
            <a href={draft.content.url} target="_blank" className="underline">
              檢視線上 v{draft.content.version}
            </a>
          </>
        ) : null}
      </p>
      <PageStudio initial={draft} />
    </div>
  );
}

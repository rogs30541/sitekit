import Link from 'next/link';
import { Section } from '@/components/Section';
import { CONTENT_SOURCE_LABELS } from '@sitekit/shared';
import { fmtDateTime } from '@/lib/api-public';
import { apiServer } from '@/lib/api-server';
import { NewContentButton } from './NewContentButton';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  type: string;
  title: string;
  slug: string;
  status: string;
  source: string;
  publishedAt: string | null;
  updatedAt: string;
  version?: number;
  hasDesign?: boolean;
  hasUnpublished?: boolean;
  draftUpdatedAt?: string | null;
}
const STATUS: Record<string, string> = { draft: '草稿', published: '已發布', archived: '封存' };

/** 內容編輯：官網頁面（/p/<slug>，home＝首頁）與文章（/blog/<slug>） */
export default async function AdminContentPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type = 'page' } = await searchParams;
  const rows = (await apiServer<Row[]>(`/api/admin/content?type=${encodeURIComponent(type)}`)) ?? [];
  return (
    <Section title={type === 'post' ? '文章' : '頁面設計'} group="(admin)">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <Link href="/admin/content?type=page" className={`underline ${type === 'page' ? 'font-bold' : ''}`}>
          官網頁面
        </Link>
        <Link href="/admin/content?type=post" className={`underline ${type === 'post' ? 'font-bold' : ''}`}>
          文章
        </Link>
        <NewContentButton type={type === 'post' ? 'post' : 'page'} />
        <span style={{ color: 'var(--muted)' }}>頁面網址 /p/&lt;slug&gt;；slug 為 home 的已發佈頁面即為首頁。所有新增／修改都先存草稿 → 沙盒預覽 → 確認發佈（發佈前自動備份上一版）。</span>
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr style={{ color: 'var(--muted)' }}>
            <th className="py-1">標題</th>
            <th className="py-1">slug</th>
            <th className="py-1">狀態</th>
            <th className="py-1">版本／草稿</th>
            <th className="py-1">來源</th>
            <th className="py-1">更新</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <td className="py-1">
                <Link href={`/admin/content/${r.id}`} className="font-semibold hover:underline">
                  {r.title}
                </Link>
              </td>
              <td className="py-1 font-mono">{r.slug}</td>
              <td className="py-1">{STATUS[r.status] ?? r.status}</td>
              <td className="py-1">
                {r.version ? `v${r.version}` : '—'}
                {r.hasDesign ? <span className="ml-1 rounded bg-neutral-100 px-1 text-[10px]">設計器</span> : null}
                {r.hasUnpublished ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">草稿未發佈</span> : null}
              </td>
              <td className="py-1">{CONTENT_SOURCE_LABELS[r.source] ?? r.source}</td>
              <td className="py-1">{fmtDateTime(r.updatedAt)}</td>
              <td className="py-1">
                {r.status === 'published' ? (
                  <a href={r.type === 'page' ? `/p/${r.slug}` : `/blog/${r.slug}`} target="_blank" className="underline">
                    檢視
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={7} className="py-2" style={{ color: 'var(--muted)' }}>
                尚無{type === 'post' ? '文章' : '頁面'}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Section>
  );
}

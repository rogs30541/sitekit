import Link from 'next/link';
import { SALES_STATUS_LABELS } from '@sitekit/shared';
import { Section } from '@/components/Section';
import { fmtDateTime } from '@/lib/api-public';
import { apiServer } from '@/lib/api-server';
import { NewSalesPageButton } from './NewSalesPageButton';

export const dynamic = 'force-dynamic';

interface Row {
  id: string;
  slug: string;
  title: string;
  code: string;
  status: string;
  version: number;
  publishedAt: string | null;
  updatedAt: string;
  items: number;
  state: string;
  hasUnpublished: boolean;
  url: string;
}

/** 一頁式銷售頁列表 */
export default async function AdminSalesPage() {
  const rows = (await apiServer<Row[]>('/api/admin/sales')) ?? [];
  return (
    <Section title="一頁式網頁" group="(admin)">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <NewSalesPageButton />
        <span style={{ color: 'var(--muted)' }}>網址 /s/&lt;slug&gt;。每頁＝通知列＋優惠倒數＋內文（設計器）＋優惠／組合／單品／加購產品區塊＋購物車＋客服；所有修改先存草稿 → 沙盒預覽 → 確認發佈（自動備份上一版）。</span>
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr style={{ color: 'var(--muted)' }}>
            <th className="py-1">標題</th>
            <th className="py-1">網址</th>
            <th className="py-1">狀態</th>
            <th className="py-1">版本／草稿</th>
            <th className="py-1">商品數</th>
            <th className="py-1">更新</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <td className="py-1">
                <Link href={`/admin/sales/${r.id}`} className="font-semibold hover:underline">
                  {r.title}
                </Link>{' '}
                <span className="font-mono opacity-60">{r.code}</span>
              </td>
              <td className="py-1 font-mono">{r.url}</td>
              <td className="py-1">{SALES_STATUS_LABELS[r.state] ?? r.state}</td>
              <td className="py-1">
                {r.version ? `v${r.version}` : '—'}
                {r.hasUnpublished ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">草稿未發佈</span> : null}
              </td>
              <td className="py-1">{r.items}</td>
              <td className="py-1">{fmtDateTime(r.updatedAt)}</td>
              <td className="py-1">
                {r.status === 'published' ? (
                  <a href={r.url} target="_blank" className="underline">
                    檢視
                  </a>
                ) : null}
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={7} className="py-2" style={{ color: 'var(--muted)' }}>
                尚無銷售頁
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Section>
  );
}

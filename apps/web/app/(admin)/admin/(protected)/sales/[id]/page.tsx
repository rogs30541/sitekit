import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiServer } from '@/lib/api-server';
import { SalesStudio, type SalesPayload, type ProductRow } from './SalesStudio';

export const dynamic = 'force-dynamic';

export default async function AdminSalesEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, products] = await Promise.all([apiServer<SalesPayload>(`/api/admin/sales/${encodeURIComponent(id)}`), apiServer<ProductRow[]>('/api/admin/catalog/products')]);
  if (!data) notFound();
  return (
    <div>
      <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/admin/sales" className="underline">
          回銷售頁列表
        </Link>
        {data.page.status === 'published' ? (
          <>
            {' · '}
            <a href={data.page.url} target="_blank" className="underline">
              檢視線上 v{data.page.version}
            </a>
          </>
        ) : null}
      </p>
      <SalesStudio initial={data} allProducts={products ?? []} />
    </div>
  );
}

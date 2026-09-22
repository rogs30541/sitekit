import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { ProductEditor, type ProductDetail } from './ProductEditor';

export const dynamic = 'force-dynamic';

export default async function AdminProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await apiServer<ProductDetail>(`/api/admin/catalog/products/${encodeURIComponent(id)}`);
  if (!p) notFound();
  return (
    <Section title={`編輯商品：${p.name}`} group="(admin)">
      <p className="mb-3 text-xs">
        <Link href="/admin/products" className="underline">
          回商品列表
        </Link>
      </p>
      <ProductEditor initial={p} />
    </Section>
  );
}

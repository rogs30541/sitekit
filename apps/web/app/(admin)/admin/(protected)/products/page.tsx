import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { ProductsClient, type AdminProduct } from './ProductsClient';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  const products = (await apiServer<AdminProduct[]>('/api/admin/catalog/products')) ?? [];
  return (
    <Section title="商品管理" group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/admin" className="underline">
          回後台首頁
        </Link>
        {' · 課程請到 '}
        <Link href="/admin/courses" className="underline">
          課程管理
        </Link>
        {' · 批量匯入用總覽 AI 面板 import_products（或 MCP）'}
      </p>
      <ProductsClient products={products} />
    </Section>
  );
}

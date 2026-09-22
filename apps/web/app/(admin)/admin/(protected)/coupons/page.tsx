import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { CouponsClient, type Coupon } from './CouponsClient';

export const dynamic = 'force-dynamic';

export default async function AdminCouponsPage() {
  const coupons = (await apiServer<Coupon[]>('/api/admin/coupons')) ?? [];
  return (
    <Section title="折扣碼" group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/admin" className="underline">
          回後台首頁
        </Link>
        {' · 同樣可由 MCP／AI 路徑 manage_coupon 操作'}
      </p>
      <CouponsClient coupons={coupons} />
    </Section>
  );
}

import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { CouponsClient, type Coupon } from './CouponsClient';

/** 折扣碼（電商／課程各自獨立；scope=all 的折扣碼兩邊都可用） */
export async function CouponsView({ scope }: { scope: 'shop' | 'course' }) {
  const coupons = (await apiServer<Coupon[]>(`/api/admin/coupons?scope=${scope}`)) ?? [];
  return (
    <Section title={scope === 'course' ? '課程折扣碼' : '電商折扣碼'} group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/admin" className="underline">
          回後台首頁
        </Link>
        {' · 只列出此範疇與「電商＋課程」通用的折扣碼；同樣可由 MCP／AI 路徑 manage_coupon 操作'}
      </p>
      <CouponsClient coupons={coupons} scope={scope} />
    </Section>
  );
}

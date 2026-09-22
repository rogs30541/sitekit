import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { PaymentSettingsForm, type PaymentConfig } from './PaymentSettingsForm';

export const dynamic = 'force-dynamic';

/** 後台金流設定：讀 /api/admin/payments/config（機密不回傳），寫入走 AI API 路徑 update_settings。 */
export default async function AdminPaymentsPage() {
  const config = await apiServer<PaymentConfig>('/api/admin/payments/config');
  return (
    <Section title="金流設定" group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/admin" className="underline">
          回後台首頁
        </Link>
        {' · '}
        <Link href="/admin/orders" className="underline">
          訂單管理
        </Link>
      </p>
      {config ? <PaymentSettingsForm config={config} /> : <p className="text-red-700">讀取金流設定失敗。</p>}
    </Section>
  );
}

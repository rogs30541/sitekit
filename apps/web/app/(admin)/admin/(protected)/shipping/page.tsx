import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { ShippingSettingsForm, type LogisticsConfig } from './ShippingSettingsForm';

export const dynamic = 'force-dynamic';

/** 物流設定：配送方式與運費、綠界物流商店參數、寄件人；寫入走 AI API 路徑 update_settings。 */
export default async function AdminShippingPage() {
  const cfg = await apiServer<LogisticsConfig>('/api/admin/logistics/config');
  return (
    <Section title="物流設定">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/admin" className="underline">
          回後台首頁
        </Link>
        {' · 超商取貨與宅配走綠界物流（C2C 店到店／黑貓／宅配通）；狀態通知網址：<site.url>/api/logistics/ecpay/notify、門市選擇回傳：/api/logistics/ecpay/map-reply。也可由 MCP update_settings 設定。'}
      </p>
      {cfg ? <ShippingSettingsForm cfg={cfg} /> : <p className="text-red-700">讀取失敗</p>}
    </Section>
  );
}

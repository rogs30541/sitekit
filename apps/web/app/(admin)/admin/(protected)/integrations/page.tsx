import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { IntegrationsForm, type IntegrationsStatus } from './IntegrationsForm';

export const dynamic = 'force-dynamic';

/** 儲存（R2）與通知（Email／LINE）設定：狀態經 AI API 路徑 storage_status 讀，寫入走 update_settings。 */
export default async function AdminIntegrationsPage() {
  const r = await apiServer<{ ok: boolean; data?: IntegrationsStatus }>('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'storage_status' }) });
  return (
    <Section title="儲存與通知" group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/admin" className="underline">
          回總覽
        </Link>
        {' · 同樣可由 MCP 的 sitekit_update_settings／sitekit_send_test_notification 操作'}
      </p>
      {r?.ok && r.data ? <IntegrationsForm status={r.data} /> : <p className="text-red-700">讀取狀態失敗。</p>}
    </Section>
  );
}

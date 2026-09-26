import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiServer, getAdminMe } from '@/lib/api-server';
import { AccountsClient, type AdminRow } from './AccountsClient';

export const dynamic = 'force-dynamic';

/** 管理員帳號（admin_users）：僅 superadmin 可管理；與前台會員完全分離。 */
export default async function AdminAccountsPage() {
  const [me, rows, settings] = await Promise.all([getAdminMe(), apiServer<AdminRow[]>('/api/admin/auth/users'), apiServer<{ ok: boolean; data?: Record<string, string> }>('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'get_settings' }) })]);
  const allowlist = settings?.data?.['admin.registerAllowlist'] ?? '';
  const primaryEmail = settings?.data?.['admin.primaryEmail'] ?? '';
  return (
    <Section title="管理員帳號" group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/admin" className="underline">
          回後台首頁
        </Link>
        {' · 後台帳號與前台會員分離；也可由 MCP create_admin／update_admin（含換 Email）／delete_admin 操作'}
      </p>
      {me?.admin?.role === 'superadmin' ? <AccountsClient rows={rows ?? []} selfId={me.admin.id} allowlist={allowlist} primaryEmail={primaryEmail} /> : <p>只有超級管理員可以管理帳號。</p>}
    </Section>
  );
}

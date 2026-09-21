import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiServer, getAdminMe } from '@/lib/api-server';
import { AccountsClient, type AdminRow } from './AccountsClient';

export const dynamic = 'force-dynamic';

/** 管理員帳號（admin_users）：僅 superadmin 可管理；與前台會員完全分離。 */
export default async function AdminAccountsPage() {
  const [me, rows] = await Promise.all([getAdminMe(), apiServer<AdminRow[]>('/api/admin/auth/users')]);
  return (
    <Section title="管理員帳號" group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/admin" className="underline">
          回總覽
        </Link>
        {' · 後台帳號與前台會員分離；也可由 MCP create_admin／update_admin／delete_admin 操作'}
      </p>
      {me?.admin?.role === 'superadmin' ? <AccountsClient rows={rows ?? []} selfId={me.admin.id} /> : <p>只有超級管理員可以管理帳號。</p>}
    </Section>
  );
}

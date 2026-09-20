import { redirect } from 'next/navigation';
import { ADMIN_ROLES } from '@sitekit/shared';
import { LogoutButton } from '@/components/LogoutButton';
import { getMe } from '@/lib/api-server';

export const metadata = { title: '後台工作站', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** 後台獨立 layout：伺服器端先驗管理員 session，非管理員直接導去登入。 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me?.authenticated || !me.user) redirect('/login?next=/admin');
  if (!ADMIN_ROLES.includes(me.user.role)) redirect('/member');
  return (
    <div className="rounded-xl border-2 border-dashed p-4" style={{ borderColor: 'var(--line)' }}>
      <div className="mb-3 flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
        <span className="font-semibold">
          後台工作站 · {me.user.displayName ?? me.user.email}（{me.user.role}）
        </span>
        <LogoutButton />
      </div>
      {children}
    </div>
  );
}

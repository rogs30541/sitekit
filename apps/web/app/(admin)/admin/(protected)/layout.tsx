import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ROLE_LABELS } from '@sitekit/shared';
import { getSite } from '@/lib/site';
import { AdminLogoutButton } from '@/components/AdminLogoutButton';
import { getAdminMe } from '@/lib/api-server';

export const metadata = { title: '後台工作站', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const MENU = [
  { href: '/admin', label: '總覽' },
  { href: '/admin/content', label: '內容編輯' },
  { href: '/admin/menu', label: '網站架構' },
  { href: '/admin/site', label: '網站設定' },
  { href: '/admin/products', label: '商品' },
  { href: '/admin/courses', label: '課程' },
  { href: '/admin/orders', label: '訂單' },
  { href: '/admin/coupons', label: '折扣碼' },
  { href: '/admin/reports', label: '報表' },
  { href: '/admin/studio', label: 'AI 工作站' },
  { href: '/admin/payments', label: '金流' },
  { href: '/admin/integrations', label: '儲存與通知' },
  { href: '/admin/accounts', label: '管理員' },
];

/** 後台受保護區：只認 admin_users 的 sk_admin session；未登入導去獨立登入頁。前台導覽在 /admin 下不顯示。 */
export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const [me, site] = await Promise.all([getAdminMe(), getSite()]);
  if (!me?.authenticated || !me.admin) redirect('/admin/login?next=/admin');
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2 text-xs" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold">{site.brand.siteName} 後台</span>
          {MENU.map((m) => (
            <Link key={m.href} href={m.href} className="hover:underline">
              {m.label}
            </Link>
          ))}
        </div>
        <span className="flex items-center gap-2" style={{ color: 'var(--muted)' }}>
          {me.admin.displayName ?? me.admin.email}（{ROLE_LABELS[me.admin.role] ?? me.admin.role}）
          <Link href="/" className="underline" target="_blank">
            前台
          </Link>
          <AdminLogoutButton />
        </span>
      </div>
      {children}
    </div>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ROLE_LABELS } from '@sitekit/shared';
import { getSite } from '@/lib/site';
import { AdminLogoutButton } from '@/components/AdminLogoutButton';
import { AdminNav } from '@/components/AdminNav';
import { apiServer, getAdminMe } from '@/lib/api-server';

export const metadata = { title: '後台工作站', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** 後台受保護區：只認 admin_users 的 sk_admin session；未登入導去獨立登入頁。前台導覽在 /admin 下不顯示。 */
export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const [me, site, setup, update] = await Promise.all([getAdminMe(), getSite(), apiServer<{ completed: boolean }>('/api/setup/status'), apiServer<{ hasUpdate: boolean; latest: string | null; current: string; url: string | null }>('/api/admin/system/update-check')]);
  if (!me?.authenticated || !me.admin) redirect('/admin/login?next=/admin');
  return (
    <div>
      {update?.hasUpdate ? (
        <div className="mb-3 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          SiteKit 有新版本 v{update.latest}（目前 v{update.current}）。
          {update.url ? (
            <a href={update.url} target="_blank" rel="noreferrer" className="ml-1 font-semibold underline">
              看更新內容
            </a>
          ) : null}
          。容器：把映像 tag 改成新版重新部署；主機安裝：下載新版發行包解壓後執行 sitekit start（遷移自動套用）。
        </div>
      ) : null}
      {setup && !setup.completed ? (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          安裝精靈尚未完成（站名／儲存／Email／金流）。
          <Link href="/setup" className="ml-1 font-semibold underline">
            繼續設定
          </Link>
          ，或到「系統功能 → 系統設定 → 健康檢查」確認各項狀態。
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin" className="font-bold">
            {site.brand.siteName} 後台
          </Link>
          <AdminNav />
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

import { Suspense } from 'react';
import { getSite } from '@/lib/site';
import { AdminLoginForm } from './AdminLoginForm';

export const metadata = { title: '後台登入', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** 後台獨立登入頁：前台不連結、不索引；帳號為 admin_users（與會員分離）。 */
export default async function AdminLoginPage() {
  const site = await getSite();
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border p-6" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {site.brand.siteName}
      </p>
      <h1 className="mt-1 text-xl font-bold">後台工作站登入</h1>
      <Suspense>
        <AdminLoginForm />
      </Suspense>
    </div>
  );
}

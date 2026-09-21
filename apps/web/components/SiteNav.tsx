'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BRAND } from '@sitekit/shared';

/** 前台導覽：不含後台入口（後台走獨立登入頁 /admin/login，前台完全不顯示）。 */
const NAV = [
  { href: '/', label: '官網' },
  { href: '/store', label: '商城' },
  { href: '/courses', label: '課程' },
  { href: '/studio', label: '工作站' },
  { href: '/member', label: '會員' },
];

export function SiteNav() {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;
  return (
    <header className="border-b" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-bold">
          {BRAND.siteName}
        </Link>
        <nav className="flex gap-4 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:underline">
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

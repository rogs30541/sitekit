'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BRAND } from '@sitekit/shared';
import { t } from '@/lib/i18n';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  newTab: boolean;
  children: NavItem[];
}

/** 後台「網站架構」尚未設定時的預設導覽 */
export const DEFAULT_NAV: NavItem[] = [
  { id: 'home', label: t('首頁'), href: '/', newTab: false, children: [] },
  { id: 'store', label: t('商城'), href: '/store', newTab: false, children: [] },
  { id: 'courses', label: t('課程'), href: '/courses', newTab: false, children: [] },
  { id: 'member', label: t('會員'), href: '/member', newTab: false, children: [] },
];

/** 前台導覽：讀後台維護的網站架構樹（兩層，子項以下拉顯示）；不含後台入口（後台走 /admin/login）。 */
export function SiteNav({ items, siteName, logoUrl, variant = 'solid' }: { items?: NavItem[]; siteName?: string; logoUrl?: string; variant?: 'solid' | 'transparent' | 'centered' | 'minimal' | 'bar' }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;
  const nav = items && items.length ? items : DEFAULT_NAV;
  const A = ({ n, className }: { n: NavItem; className?: string }) =>
    n.href.startsWith('/') ? (
      <Link href={n.href} className={className} target={n.newTab ? '_blank' : undefined}>
        {n.label}
      </Link>
    ) : (
      <a href={n.href} className={className} target={n.newTab ? '_blank' : undefined} rel="noopener">
        {n.label}
      </a>
    );
  return (
    <header className={variant === 'transparent' ? '' : variant === 'bar' ? 'border-b-2' : 'border-b'} style={variant === 'transparent' ? { background: 'transparent' } : variant === 'bar' ? { borderColor: 'var(--accent)', background: 'var(--card)' } : { borderColor: 'var(--line)', background: 'var(--card)' }}>
      <div className={`sk-container flex flex-wrap items-center gap-2 px-4 ${variant === 'centered' ? 'flex-col justify-center py-4' : variant === 'minimal' ? 'justify-between py-2' : 'justify-between py-3'}`}>
        <Link href="/" className={`flex items-center gap-2 font-bold ${variant === 'centered' ? 'text-lg' : ''}`}>
          {logoUrl ? <img src={logoUrl} alt="" className="h-7 w-auto" /> : null}
          {siteName ?? BRAND.siteName}
        </Link>
        <nav className={`flex flex-wrap gap-4 text-sm ${variant === 'centered' ? 'justify-center' : ''} ${variant === 'minimal' ? 'uppercase tracking-wider text-xs' : ''}`}>
          {nav.map((n) =>
            n.children.length ? (
              <details key={n.id} className="group relative">
                <summary className="cursor-pointer list-none hover:underline">{n.label} ▾</summary>
                <div className="absolute left-0 z-10 mt-1 min-w-40 rounded-lg border p-2 shadow" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
                  <A n={n} className="block px-2 py-1 hover:underline" />
                  {n.children.map((c) => (
                    <A key={c.id} n={c} className="block px-2 py-1 hover:underline" />
                  ))}
                </div>
              </details>
            ) : (
              <A key={n.id} n={n} className="hover:underline" />
            ),
          )}
        </nav>
      </div>
    </header>
  );
}

import type { Metadata } from 'next';
import { BRAND } from '@sitekit/shared';
import { SiteNav, type NavItem } from '@/components/SiteNav';
import { apiPublic } from '@/lib/api-public';
import './globals.css';

export const metadata: Metadata = {
  title: { default: BRAND.siteName, template: `%s | ${BRAND.siteName}` },
  description: BRAND.description,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const menu = (await apiPublic<NavItem[]>('/api/content/menu')) ?? [];
  return (
    <html lang={BRAND.locale}>
      <body className="min-h-screen antialiased">
        <SiteNav items={menu} />
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

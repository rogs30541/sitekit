import type { Metadata } from 'next';
import { BRAND } from '@sitekit/shared';
import { SiteNav } from '@/components/SiteNav';
import './globals.css';

export const metadata: Metadata = {
  title: { default: BRAND.siteName, template: `%s | ${BRAND.siteName}` },
  description: BRAND.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={BRAND.locale}>
      <body className="min-h-screen antialiased">
        <SiteNav />
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

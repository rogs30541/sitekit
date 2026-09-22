import type { Metadata } from 'next';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteNav } from '@/components/SiteNav';
import { Tracking } from '@/components/Tracking';
import { MainFrame } from '@/components/MainFrame';
import { getSite } from '@/lib/site';
import { SITE_URL } from '@/lib/api-public';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await getSite();
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: brand.siteName, template: `%s | ${brand.siteName}` },
    description: brand.description,
    openGraph: { siteName: brand.siteName, type: 'website', locale: 'zh_TW', ...(brand.seo.ogImage ? { images: [brand.seo.ogImage] } : {}) },
    ...(brand.logoUrl ? { icons: { icon: brand.logoUrl } } : {}),
  };
}

/** 根版面：品牌／選單／頁尾／GA 全部來自後台「網站設定」與「網站架構」（ISR 60 秒）。 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const site = await getSite();
  const accent = site.brand.primaryColor || '#171717';
  return (
    <html lang={site.brand.locale} style={{ ['--accent' as string]: accent }}>
      <body className="min-h-screen antialiased">
        <SiteNav items={site.menus.header} siteName={site.brand.siteName} logoUrl={site.brand.logoUrl} />
        <MainFrame>{children}</MainFrame>
        <SiteFooter site={site} items={site.menus.footer} />
        <Tracking config={site.tracking} scope="site" />
      </body>
    </html>
  );
}

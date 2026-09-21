import type { Metadata } from 'next';
import Script from 'next/script';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteNav } from '@/components/SiteNav';
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
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        <SiteFooter site={site} items={site.menus.footer} />
        {site.brand.seo.gaId ? (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(site.brand.seo.gaId)}`} strategy="afterInteractive" />
            <Script id="ga" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${site.brand.seo.gaId.replace(/[^A-Za-z0-9-]/g, '')}');`}</Script>
          </>
        ) : null}
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteNav } from '@/components/SiteNav';
import { Tracking } from '@/components/Tracking';
import { MainFrame } from '@/components/MainFrame';
import { getSite } from '@/lib/site';
import { htmlLang, setLocale } from '@/lib/i18n';
import { I18nProvider } from '@/components/I18nProvider';
import { SITE_URL } from '@/lib/api-public';
import { themeCssVars } from '@sitekit/shared';
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
  setLocale(site.brand.locale);
  // 主題（套版 theme.*）→ CSS 變數；brand.primaryColor 仍作 accent 備援（themeFromSettings 已處理）
  const vars = themeCssVars(site.theme) as Record<string, string>;
  return (
    <html lang={htmlLang(site.brand.locale)} style={vars as React.CSSProperties} data-theme={site.theme.mode} data-header={site.theme.header} data-footer={site.theme.footer} data-heading={site.theme.heading}>
      <body className="min-h-screen antialiased">
        <I18nProvider locale={site.brand.locale}>
          <SiteNav items={site.menus.header} siteName={site.brand.siteName} logoUrl={site.brand.logoUrl} variant={site.theme.header} />
          <MainFrame>{children}</MainFrame>
          <SiteFooter site={site} items={site.menus.footer} />
        </I18nProvider>
        <Tracking config={site.tracking} scope="site" />
      </body>
    </html>
  );
}

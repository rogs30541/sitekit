import { BRAND, defaultTracking, type TrackingConfig } from '@sitekit/shared';
import { apiPublic } from './api-public';
import type { NavItem } from '@/components/SiteNav';

export interface HomeSection {
  kind: 'hero' | 'features' | 'courses' | 'products' | 'posts' | 'html' | 'cta';
  title?: string;
  subtitle?: string;
  ctaText?: string;
  ctaHref?: string;
  imageUrl?: string;
  align?: 'left' | 'center';
  items?: { title: string; text?: string; icon?: string }[];
  limit?: number;
  html?: string;
  text?: string;
  buttonText?: string;
  buttonHref?: string;
}
export interface SiteConfig {
  brand: {
    name: string;
    siteName: string;
    description: string;
    tagline: string;
    logoUrl: string;
    primaryColor: string;
    contactEmail: string;
    phone: string;
    address: string;
    social: { facebook: string; instagram: string; line: string; youtube: string };
    footerText: string;
    locale: string;
    seo: { ogImage: string; gaId: string };
  };
  menus: { header: NavItem[]; footer: NavItem[] };
  home: { sections: HomeSection[] };
  tracking: TrackingConfig;
}

const FALLBACK: SiteConfig = {
  brand: { name: BRAND.name, siteName: BRAND.siteName, description: BRAND.description, tagline: '', logoUrl: '', primaryColor: '', contactEmail: '', phone: '', address: '', social: { facebook: '', instagram: '', line: '', youtube: '' }, footerText: '', locale: BRAND.locale, seo: { ogImage: '', gaId: '' } },
  menus: { header: [], footer: [] },
  home: { sections: [] },
  tracking: defaultTracking(),
};

/** 站台設定（品牌／選單／首頁區塊）：ISR 60 秒；api 不在線時退回內建預設，讓建置不會失敗。 */
export async function getSite(): Promise<SiteConfig> {
  const s = await apiPublic<SiteConfig>('/api/content/site');
  return s ? { ...FALLBACK, ...s, brand: { ...FALLBACK.brand, ...s.brand, social: { ...FALLBACK.brand.social, ...(s.brand?.social ?? {}) }, seo: { ...FALLBACK.brand.seo, ...(s.brand?.seo ?? {}) } }, tracking: { ...FALLBACK.tracking, ...(s.tracking ?? {}), events: { ...FALLBACK.tracking.events, ...(s.tracking?.events ?? {}) } } } : FALLBACK;
}

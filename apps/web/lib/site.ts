import { BRAND, DEFAULT_THEME, defaultTracking, type Section, type Theme, type TrackingConfig } from '@sitekit/shared';
import { apiPublic } from './api-public';
import type { NavItem } from '@/components/SiteNav';

/** 首頁／區塊頁的區塊：與套版共用 schema（packages/shared/site-templates/sections.ts，20 種 kind） */
export type HomeSection = Section;
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
  theme: Theme;
  menus: { header: NavItem[]; footer: NavItem[] };
  home: { sections: HomeSection[] };
  tracking: TrackingConfig;
}

const FALLBACK: SiteConfig = {
  brand: { name: BRAND.name, siteName: BRAND.siteName, description: BRAND.description, tagline: '', logoUrl: '', primaryColor: '', contactEmail: '', phone: '', address: '', social: { facebook: '', instagram: '', line: '', youtube: '' }, footerText: '', locale: BRAND.locale, seo: { ogImage: '', gaId: '' } },
  theme: DEFAULT_THEME,
  menus: { header: [], footer: [] },
  home: { sections: [] },
  tracking: defaultTracking(),
};

/** 站台設定（品牌／選單／首頁區塊）：ISR 60 秒；api 不在線時退回內建預設，讓建置不會失敗。 */
export async function getSite(): Promise<SiteConfig> {
  const s = await apiPublic<SiteConfig>('/api/content/site');
  return s ? { ...FALLBACK, ...s, brand: { ...FALLBACK.brand, ...s.brand, social: { ...FALLBACK.brand.social, ...(s.brand?.social ?? {}) }, seo: { ...FALLBACK.brand.seo, ...(s.brand?.seo ?? {}) } }, theme: { ...DEFAULT_THEME, ...(s.theme ?? {}) }, tracking: { ...FALLBACK.tracking, ...(s.tracking ?? {}), events: { ...FALLBACK.tracking.events, ...(s.tracking?.events ?? {}) } } } : FALLBACK;
}

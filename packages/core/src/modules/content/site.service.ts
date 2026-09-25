import { Injectable } from '../../compat';
import { BRAND, SETTING_KEYS, normalizeLocale, normalizeTracking, sectionsInputSchema, themeFromSettings, type Section, type TrackingConfig } from '@sitekit/shared';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { sanitizeHtml } from '../migration/normalize';
import { MenuService } from './menu.service';

// 首頁區塊 schema 與套版共用（packages/shared/site-templates/sections.ts：20 種 kind）
const sectionsInput = sectionsInputSchema;
export type HomeSection = Section;

export const BRAND_FIELDS = [
  { key: SETTING_KEYS.brandName, label: '品牌名稱', def: BRAND.name },
  { key: SETTING_KEYS.brandSiteName, label: '網站名稱（標題列）', def: BRAND.siteName },
  { key: SETTING_KEYS.brandDescription, label: '網站描述（SEO）', def: BRAND.description },
  { key: SETTING_KEYS.siteLocale, label: '前台介面語言', def: 'zh-TW' },
  { key: SETTING_KEYS.brandTagline, label: '標語', def: '' },
  { key: SETTING_KEYS.brandLogoUrl, label: 'Logo 圖片網址', def: '' },
  { key: SETTING_KEYS.brandPrimaryColor, label: '主色（#hex）', def: '' },
  { key: SETTING_KEYS.brandContactEmail, label: '聯絡 Email', def: '' },
  { key: SETTING_KEYS.brandPhone, label: '電話', def: '' },
  { key: SETTING_KEYS.brandAddress, label: '地址', def: '' },
  { key: SETTING_KEYS.brandFacebook, label: 'Facebook 網址', def: '' },
  { key: SETTING_KEYS.brandInstagram, label: 'Instagram 網址', def: '' },
  { key: SETTING_KEYS.brandLine, label: 'LINE 官方帳號網址', def: '' },
  { key: SETTING_KEYS.brandYoutube, label: 'YouTube 網址', def: '' },
  { key: SETTING_KEYS.brandFooterText, label: '頁尾文字', def: '' },
  { key: SETTING_KEYS.seoOgImage, label: '預設分享圖（OG image）網址', def: '' },
] as const;

/** 站台外觀設定：品牌／聯絡／社群／SEO 全走 settings（後台或 MCP update_settings 可改）；首頁版面區塊存 `home.sections`（JSON，經驗證）。 */
@Injectable()
export class SiteService {
  constructor(
    private readonly settings: SettingsService,
    private readonly menu: MenuService,
    private readonly prisma: PrismaClient,
  ) {}

  async brand() {
    const all = await this.settings.all();
    const get = (key: string, def: string) => (all.get(key) ?? '').trim() || def;
    const social = { facebook: get(SETTING_KEYS.brandFacebook, ''), instagram: get(SETTING_KEYS.brandInstagram, ''), line: get(SETTING_KEYS.brandLine, ''), youtube: get(SETTING_KEYS.brandYoutube, '') };
    return {
      name: get(SETTING_KEYS.brandName, BRAND.name),
      siteName: get(SETTING_KEYS.brandSiteName, BRAND.siteName),
      description: get(SETTING_KEYS.brandDescription, BRAND.description),
      tagline: get(SETTING_KEYS.brandTagline, ''),
      logoUrl: get(SETTING_KEYS.brandLogoUrl, ''),
      primaryColor: /^#[0-9a-f]{3,8}$/i.test(get(SETTING_KEYS.brandPrimaryColor, '')) ? get(SETTING_KEYS.brandPrimaryColor, '') : '',
      contactEmail: get(SETTING_KEYS.brandContactEmail, ''),
      phone: get(SETTING_KEYS.brandPhone, ''),
      address: get(SETTING_KEYS.brandAddress, ''),
      social,
      footerText: get(SETTING_KEYS.brandFooterText, ''),
      locale: normalizeLocale(get(SETTING_KEYS.siteLocale, 'zh-TW')),
      seo: { ogImage: get(SETTING_KEYS.seoOgImage, ''), gaId: get(SETTING_KEYS.seoGaId, '') },
    };
  }

  /** 網站層級追蹤碼（seo.gaId 為舊欄位：tracking.ga4 未設時沿用） */
  async tracking(): Promise<TrackingConfig> {
    const all = await this.settings.all();
    const get = (k: string) => all.get(k) ?? '';
    let events: unknown = {};
    try {
      events = JSON.parse(get(SETTING_KEYS.trackingEvents) || '{}');
    } catch {
      events = {};
    }
    let scroll: unknown = undefined;
    try {
      scroll = get(SETTING_KEYS.trackingScroll) ? JSON.parse(get(SETTING_KEYS.trackingScroll)) : undefined;
    } catch {
      scroll = undefined;
    }
    return normalizeTracking({ scroll, ga4: get(SETTING_KEYS.trackingGa4) || get(SETTING_KEYS.seoGaId), gtm: get(SETTING_KEYS.trackingGtm), fbPixel: get(SETTING_KEYS.trackingFbPixel), tiktok: get(SETTING_KEYS.trackingTiktok), lineTag: get(SETTING_KEYS.trackingLineTag), googleAdsId: get(SETTING_KEYS.trackingGoogleAdsId), googleAdsLabel: get(SETTING_KEYS.trackingGoogleAdsLabel), head: get(SETTING_KEYS.trackingHead), bodyTop: get(SETTING_KEYS.trackingBodyTop), bodyBottom: get(SETTING_KEYS.trackingBodyBottom), events });
  }
  async setTracking(input: unknown) {
    const t = normalizeTracking(input);
    const rows: [string, string][] = [[SETTING_KEYS.trackingScroll, JSON.stringify(t.scroll)], [SETTING_KEYS.trackingGa4, t.ga4], [SETTING_KEYS.trackingGtm, t.gtm], [SETTING_KEYS.trackingFbPixel, t.fbPixel], [SETTING_KEYS.trackingTiktok, t.tiktok], [SETTING_KEYS.trackingLineTag, t.lineTag], [SETTING_KEYS.trackingGoogleAdsId, t.googleAdsId], [SETTING_KEYS.trackingGoogleAdsLabel, t.googleAdsLabel], [SETTING_KEYS.trackingHead, t.head], [SETTING_KEYS.trackingBodyTop, t.bodyTop], [SETTING_KEYS.trackingBodyBottom, t.bodyBottom], [SETTING_KEYS.trackingEvents, JSON.stringify(t.events)]];
    for (const [key, value] of rows) await this.prisma.setting.upsert({ where: { key }, create: { key, value, isSecret: false }, update: { value } });
    this.settings.invalidate();
    return t;
  }

  async homeSections(): Promise<HomeSection[]> {
    const raw = await this.settings.get(SETTING_KEYS.homeSections, 'HOME_SECTIONS', '');
    if (!raw) return [];
    try {
      const r = sectionsInput.safeParse({ sections: JSON.parse(raw) });
      return r.success ? r.data.sections : [];
    } catch {
      return [];
    }
  }

  async setHomeSections(input: unknown) {
    const { sections: raw } = sectionsInput.parse(input);
    const sections = raw.map((s) => (s.kind === 'html' ? { ...s, html: sanitizeHtml(s.html) } : s));
    await this.prisma.setting.upsert({ where: { key: SETTING_KEYS.homeSections }, update: { value: JSON.stringify(sections) }, create: { key: SETTING_KEYS.homeSections, value: JSON.stringify(sections), isSecret: false } });
    this.settings.invalidate();
    return sections;
  }

  /** 前台一次拿齊：品牌、SEO、主選單、頁尾選單、首頁區塊 */
  async publicSite() {
    const [brand, header, footer, sections] = await Promise.all([this.brand(), this.menu.tree(true, 'header'), this.menu.tree(true, 'footer'), this.homeSections()]);
    const tracking = await this.tracking();
    const all = await this.settings.all();
    const theme = themeFromSettings((k) => all.get(k));
    return { tracking, brand, theme, menus: { header, footer }, home: { sections } };
  }

  /** 後台編輯用：目前值（settings 原值）＋欄位定義＋首頁區塊 */
  async adminSite() {
    const all = await this.settings.all();
    return { fields: BRAND_FIELDS.map((f) => ({ key: f.key, label: f.label, value: all.get(f.key) ?? '', placeholder: f.def })), sections: await this.homeSections(), tracking: await this.tracking() };
  }
}

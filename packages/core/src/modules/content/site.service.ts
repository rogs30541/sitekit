import { Injectable } from '../../compat';
import { BRAND, SETTING_KEYS, normalizeTracking, type TrackingConfig } from '@sitekit/shared';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import { sanitizeHtml } from '../migration/normalize';
import { MenuService } from './menu.service';

const url = z.string().max(500).refine((s) => s === '' || s.startsWith('/') || /^https?:\/\//.test(s), '需為 / 開頭的站內路徑或 http(s) 網址');
const sectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hero'), title: z.string().max(120), subtitle: z.string().max(400).optional().default(''), ctaText: z.string().max(40).optional().default(''), ctaHref: url.optional().default(''), imageUrl: url.optional().default(''), align: z.enum(['left', 'center']).optional().default('center') }),
  z.object({ kind: z.literal('features'), title: z.string().max(120).optional().default(''), items: z.array(z.object({ title: z.string().max(80), text: z.string().max(400).optional().default(''), icon: z.string().max(8).optional().default('') })).max(12) }),
  z.object({ kind: z.literal('courses'), title: z.string().max(120).optional().default('精選課程'), limit: z.number().int().min(1).max(12).optional().default(3) }),
  z.object({ kind: z.literal('products'), title: z.string().max(120).optional().default('熱門商品'), limit: z.number().int().min(1).max(12).optional().default(3) }),
  z.object({ kind: z.literal('posts'), title: z.string().max(120).optional().default('最新文章'), limit: z.number().int().min(1).max(12).optional().default(3) }),
  z.object({ kind: z.literal('html'), title: z.string().max(120).optional().default(''), html: z.string().max(100_000) }),
  z.object({ kind: z.literal('cta'), title: z.string().max(120), text: z.string().max(400).optional().default(''), buttonText: z.string().max(40).optional().default(''), buttonHref: url.optional().default('') }),
]);
export type HomeSection = z.infer<typeof sectionSchema>;
const sectionsInput = z.object({ sections: z.array(sectionSchema).max(20) });

export const BRAND_FIELDS = [
  { key: SETTING_KEYS.brandName, label: '品牌名稱', def: BRAND.name },
  { key: SETTING_KEYS.brandSiteName, label: '網站名稱（標題列）', def: BRAND.siteName },
  { key: SETTING_KEYS.brandDescription, label: '網站描述（SEO）', def: BRAND.description },
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
      locale: BRAND.locale,
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
    return normalizeTracking({ ga4: get(SETTING_KEYS.trackingGa4) || get(SETTING_KEYS.seoGaId), gtm: get(SETTING_KEYS.trackingGtm), fbPixel: get(SETTING_KEYS.trackingFbPixel), tiktok: get(SETTING_KEYS.trackingTiktok), lineTag: get(SETTING_KEYS.trackingLineTag), googleAdsId: get(SETTING_KEYS.trackingGoogleAdsId), googleAdsLabel: get(SETTING_KEYS.trackingGoogleAdsLabel), head: get(SETTING_KEYS.trackingHead), bodyTop: get(SETTING_KEYS.trackingBodyTop), bodyBottom: get(SETTING_KEYS.trackingBodyBottom), events });
  }
  async setTracking(input: unknown) {
    const t = normalizeTracking(input);
    const rows: [string, string][] = [[SETTING_KEYS.trackingGa4, t.ga4], [SETTING_KEYS.trackingGtm, t.gtm], [SETTING_KEYS.trackingFbPixel, t.fbPixel], [SETTING_KEYS.trackingTiktok, t.tiktok], [SETTING_KEYS.trackingLineTag, t.lineTag], [SETTING_KEYS.trackingGoogleAdsId, t.googleAdsId], [SETTING_KEYS.trackingGoogleAdsLabel, t.googleAdsLabel], [SETTING_KEYS.trackingHead, t.head], [SETTING_KEYS.trackingBodyTop, t.bodyTop], [SETTING_KEYS.trackingBodyBottom, t.bodyBottom], [SETTING_KEYS.trackingEvents, JSON.stringify(t.events)]];
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
    return { tracking, brand, menus: { header, footer }, home: { sections } };
  }

  /** 後台編輯用：目前值（settings 原值）＋欄位定義＋首頁區塊 */
  async adminSite() {
    const all = await this.settings.all();
    return { fields: BRAND_FIELDS.map((f) => ({ key: f.key, label: f.label, value: all.get(f.key) ?? '', placeholder: f.def })), sections: await this.homeSections(), tracking: await this.tracking() };
  }
}

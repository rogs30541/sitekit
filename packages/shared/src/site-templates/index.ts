/**
 * 快速套版：五大分類 × 10 套＝50 套「網站版型」，每套＝主題＋選單＋首頁區塊＋子頁區塊。
 * 套用（core SiteTemplateService.apply）＝寫 settings（theme.*、home.sections）＋選單＋頁面（slug 冪等），不動商品／課程／文章。
 * 命名法沿用「用途 (風格)」；靈感來源只取版面骨架（docs/套版研究筆記.md）。
 */
import { IMAGE_TEMPLATES } from './templates/image';
import { SHOP_TEMPLATES } from './templates/shop';
import { COURSE_TEMPLATES } from './templates/course';
import { BRAND_TEMPLATES } from './templates/brand';
import { SERVICE_TEMPLATES } from './templates/service';

export * from './sections';
export * from './theme';

export * from './common';
import type { SiteTemplate, TemplateCategory } from './common';

export const SITE_TEMPLATES: SiteTemplate[] = [...IMAGE_TEMPLATES, ...SHOP_TEMPLATES, ...COURSE_TEMPLATES, ...BRAND_TEMPLATES, ...SERVICE_TEMPLATES];
export const getSiteTemplate = (id: string) => SITE_TEMPLATES.find((t) => t.id === id);
export const listSiteTemplates = (category?: TemplateCategory) => SITE_TEMPLATES.filter((t) => !category || t.category === category).map(({ id, category, name, style, tagline, tags, source, theme, pages, home, menu }) => ({ id, category, name, style, tagline, tags, source, theme, pages: pages.map((p) => p.slug), homeKinds: home.map((s) => `${s.kind}${'variant' in s && s.variant ? ':' + s.variant : ''}${'tone' in s && s.tone && s.tone !== 'default' ? '@' + s.tone : ''}`), headerMenu: menu.header.map((m) => m.label) }));
export type SiteTemplateSummary = ReturnType<typeof listSiteTemplates>[number];

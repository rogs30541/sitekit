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
export * from './icons';

export * from './common';
import { PAGES, type SiteTemplate, type TemplateCategory, type TemplatePage } from './common';

/** 版型的選單／區塊若連到 /p/<slug> 但沒附該子頁，自動補通用頁（about／contact／faq），保證套用後沒有死連結 */
const GENERIC_PAGES: Record<string, () => TemplatePage> = { about: PAGES.about, contact: () => PAGES.contact(), faq: () => PAGES.faq([{ q: '如何聯絡你們？', a: '請到「聯絡我們」頁面留下需求。' }]) };
function withGenericPages(t: SiteTemplate): SiteTemplate {
  const refs = new Set<string>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x === 'string' && /href/i.test(k) && x.startsWith('/p/')) refs.add(x.slice(3).split(/[?#]/)[0]);
      else if (typeof x === 'object') walk(x);
    }
  };
  walk(t.menu);
  walk(t.home);
  walk(t.pages);
  const have = new Set(t.pages.map((p) => p.slug));
  const extra = [...refs].filter((x) => !have.has(x) && GENERIC_PAGES[x]).map((x) => GENERIC_PAGES[x]());
  return extra.length ? { ...t, pages: [...t.pages, ...extra] } : t;
}
export const SITE_TEMPLATES: SiteTemplate[] = [...IMAGE_TEMPLATES, ...SHOP_TEMPLATES, ...COURSE_TEMPLATES, ...BRAND_TEMPLATES, ...SERVICE_TEMPLATES].map(withGenericPages);
export const getSiteTemplate = (id: string) => SITE_TEMPLATES.find((t) => t.id === id);
export const listSiteTemplates = (category?: TemplateCategory) => SITE_TEMPLATES.filter((t) => !category || t.category === category).map(({ id, category, name, style, tagline, tags, source, theme, pages, home, menu }) => ({ id, category, name, style, tagline, tags, source, theme, pages: pages.map((p) => p.slug), homeKinds: home.map((s) => `${s.kind}${'variant' in s && s.variant ? ':' + s.variant : ''}${'tone' in s && s.tone && s.tone !== 'default' ? '@' + s.tone : ''}`), headerMenu: menu.header.map((m) => m.label) }));
export type SiteTemplateSummary = ReturnType<typeof listSiteTemplates>[number];

/**
 * 頁面區塊（sections）schema：首頁「網站設定 → 首頁版面」與「區塊頁」（Content.design = { kind: 'sections' }）共用。
 * 20 種 kind，多數有 variant；所有欄位皆有預設值，套版資料只需寫最少欄位。
 * 前台由 apps/web/components/SectionRenderer.tsx 渲染；後台編輯器對未知欄位以 JSON 方式編輯。
 */
import { z } from 'zod';

const url = z.string().max(2000).refine((v) => v === '' || /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(v), '連結必須是 http(s)://、/ 開頭、# 或 mailto:/tel:');
const short = (n = 120) => z.string().max(n);
const text = (n = 600) => z.string().max(n);
const optShort = (n = 120) => short(n).optional().default('');
const optText = (n = 600) => text(n).optional().default('');
const optUrl = url.optional().default('');
const cols = z.number().int().min(1).max(4).optional().default(3);
const galleryCols = z.number().int().min(1).max(6).optional().default(3);
const limit = z.number().int().min(1).max(24).optional().default(6);

const cta = { ctaText: optShort(40), ctaHref: optUrl, cta2Text: optShort(40), cta2Href: optUrl };
const heading = { title: optShort(160), subtitle: optText(400), kicker: optShort(60) };
/** 區塊外觀：tone 決定底色（default 跟主題、muted 淺灰、accent 主色、dark 深色、image 背景圖） */
const look = { tone: z.enum(['default', 'muted', 'accent', 'dark', 'image']).optional().default('default'), bgImageUrl: optUrl, id: optShort(40), compact: z.boolean().optional().default(false) };

export const sectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hero'), variant: z.enum(['center', 'left', 'split', 'cover', 'editorial', 'dashboard', 'carousel']).optional().default('center'), ...heading, ...cta, imageUrl: optUrl, videoUrl: optUrl, imageSide: z.enum(['right', 'left']).optional().default('right'), highlights: z.array(z.object({ icon: optShort(24), title: short(60), text: optShort(120) })).max(4).optional().default([]), slides: z.array(z.object({ title: short(120), subtitle: optText(300), imageUrl: optUrl, ctaText: optShort(40), ctaHref: optUrl })).max(8).optional().default([]), ...look }),
  z.object({ kind: z.literal('banner'), text: short(200), href: optUrl, ...look }),
  z.object({ kind: z.literal('stats'), variant: z.enum(['row', 'cards', 'inline']).optional().default('row'), ...heading, items: z.array(z.object({ value: short(24), label: short(60), note: optShort(120) })).min(1).max(8), ...look }),
  z.object({ kind: z.literal('features'), variant: z.enum(['grid', 'list', 'icons', 'tabs', 'numbered']).optional().default('grid'), ...heading, columns: cols, items: z.array(z.object({ icon: optShort(24), code: optShort(24), tag: optShort(24), title: short(80), text: optText(400), href: optUrl, ctaText: optShort(40) })).max(16), ...look }),
  z.object({ kind: z.literal('split'), ...heading, text: optText(1200), imageUrl: optUrl, videoUrl: optUrl, imageSide: z.enum(['right', 'left']).optional().default('right'), bullets: z.array(short(120)).max(8).optional().default([]), ...cta, sticky: z.boolean().optional().default(false), ...look }),
  z.object({ kind: z.literal('gallery'), variant: z.enum(['grid', 'masonry', 'strip', 'logos']).optional().default('grid'), ...heading, columns: galleryCols, items: z.array(z.object({ imageUrl: url, caption: optShort(80), href: optUrl })).max(36), ...look }),
  z.object({ kind: z.literal('testimonials'), variant: z.enum(['cards', 'quotes', 'wall', 'single']).optional().default('cards'), ...heading, items: z.array(z.object({ quote: text(400), name: short(40), role: optShort(60), avatarUrl: optUrl, metric: optShort(24) })).max(12), ...look }),
  z.object({ kind: z.literal('faq'), ...heading, items: z.array(z.object({ q: short(200), a: text(1200) })).max(20), ...look }),
  z.object({ kind: z.literal('pricing'), ...heading, plans: z.array(z.object({ name: short(40), price: short(24), period: optShort(24), note: optShort(120), features: z.array(short(80)).max(12).optional().default([]), ctaText: optShort(40), ctaHref: optUrl, highlight: z.boolean().optional().default(false) })).min(1).max(4), ...look }),
  z.object({ kind: z.literal('steps'), variant: z.enum(['numbers', 'timeline', 'cards']).optional().default('numbers'), ...heading, items: z.array(z.object({ title: short(80), text: optText(300) })).min(1).max(10), ...look }),
  z.object({ kind: z.literal('team'), variant: z.enum(['grid', 'list', 'founder']).optional().default('grid'), ...heading, members: z.array(z.object({ name: short(40), role: optShort(60), bio: optText(400), avatarUrl: optUrl })).max(12), ...look }),
  z.object({ kind: z.literal('logos'), ...heading, items: z.array(z.object({ name: short(40), imageUrl: optUrl })).max(16), ...look }),
  z.object({ kind: z.literal('video'), ...heading, videoUrl: url, text: optText(400), ...look }),
  z.object({ kind: z.literal('cta'), variant: z.enum(['band', 'card', 'split']).optional().default('band'), title: short(160), text: optText(400), buttonText: optShort(40), buttonHref: optUrl, ...cta, ...look }),
  z.object({ kind: z.literal('contact'), ...heading, variant: z.enum(['cards', 'columns', 'map']).optional().default('cards'), mapEmbedUrl: optUrl, showForm: z.boolean().optional().default(false), items: z.array(z.object({ icon: optShort(24), label: short(40), value: short(200), href: optUrl })).max(6).optional().default([]), ...look }),
  z.object({ kind: z.literal('categories'), variant: z.enum(['tiles', 'chips', 'icons']).optional().default('tiles'), ...heading, columns: cols, items: z.array(z.object({ icon: optShort(24), title: short(40), href: optUrl, count: optShort(16), imageUrl: optUrl })).max(16), ...look }),
  z.object({ kind: z.literal('courses'), variant: z.enum(['grid', 'list', 'ranking', 'featured', 'progress', 'strip']).optional().default('grid'), title: optShort(120), subtitle: optText(300), columns: cols, limit, ctaText: optShort(40), ctaHref: optUrl, ...look }),
  z.object({ kind: z.literal('products'), variant: z.enum(['grid', 'list', 'ranking', 'featured', 'strip']).optional().default('grid'), title: optShort(120), subtitle: optText(300), columns: cols, limit, ctaText: optShort(40), ctaHref: optUrl, ...look }),
  z.object({ kind: z.literal('posts'), variant: z.enum(['grid', 'list', 'featured', 'strip']).optional().default('list'), title: optShort(120), subtitle: optText(300), columns: cols, limit, ctaText: optShort(40), ctaHref: optUrl, ...look }),
  z.object({ kind: z.literal('html'), title: optShort(120), html: z.string().max(100_000), ...look }),
]);
export type Section = z.infer<typeof sectionSchema>;
/** 撰寫套版資料用（欄位有預設值可省略） */
export type SectionInput = z.input<typeof sectionSchema>;
export type SectionKind = Section['kind'];
export const sectionsInputSchema = z.object({ sections: z.array(sectionSchema).max(40) });

export const SECTION_KIND_LABELS: Record<SectionKind, string> = {
  hero: '主視覺', banner: '公告帶', stats: '數字', features: '特色／服務', split: '左右圖文', gallery: '圖片牆', testimonials: '見證', faq: '常見問題', pricing: '方案表', steps: '流程', team: '團隊', logos: '客戶牆', video: '影片', cta: '行動呼籲', contact: '聯絡', categories: '分類磚', courses: '課程列表', products: '商品列表', posts: '文章列表', html: '自訂 HTML',
};

/** 區塊頁設計文件：Content.design = { kind: 'sections', sections } */
export interface SectionsDoc { kind: 'sections'; sections: Section[]; template?: string; settings?: Record<string, unknown> }
/** 區塊頁的後備 HTML（無 JS／RSS／搜尋引擎摘要／傳統編輯器切換用）；前台以 SectionRenderer 渲染 sections */
export function sectionsFallbackHtml(sections: Section[]): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
  const parts: string[] = [];
  for (const s of sections) {
    const title = 'title' in s && s.title ? `<h2>${esc(s.title)}</h2>` : '';
    const sub = 'subtitle' in s && s.subtitle ? `<p>${esc(s.subtitle)}</p>` : '';
    const text = 'text' in s && typeof s.text === 'string' && s.text ? `<p>${esc(s.text)}</p>` : '';
    const list = 'items' in s && Array.isArray(s.items) ? s.items : 'plans' in s ? s.plans : 'members' in s ? s.members : [];
    const items = list.length ? `<ul>${(list as Record<string, string>[]).map((i) => `<li>${esc(i.title ?? i.label ?? i.q ?? i.name ?? i.value ?? '')}${i.text ? `：${esc(i.text)}` : i.a ? `：${esc(i.a)}` : ''}</li>`).join('')}</ul>` : '';
    const html = s.kind === 'html' ? s.html : '';
    parts.push(`<section>${title}${sub}${text}${items}${html}</section>`);
  }
  return parts.join('\n');
}
/** 驗證並正規化區塊頁文件（設計文件 kind='sections'）；不合法丟 zod error */
export function parseSectionsDoc(v: unknown): SectionsDoc {
  const d = v as { kind?: string; sections?: unknown; template?: string; settings?: Record<string, unknown> };
  if (!d || typeof d !== 'object' || d.kind !== 'sections') throw new Error('not a sections doc');
  const { sections } = sectionsInputSchema.parse({ sections: d.sections ?? [] });
  return { kind: 'sections', sections, ...(d.template ? { template: d.template } : {}), ...(d.settings ? { settings: d.settings } : {}) };
}
export const isSectionsDoc = (d: unknown): d is SectionsDoc => !!d && typeof d === 'object' && (d as { kind?: string }).kind === 'sections' && Array.isArray((d as { sections?: unknown }).sections);

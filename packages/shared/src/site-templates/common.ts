/** 套版共用型別與常用片段（獨立模組：避免 templates/* 與 index 的循環相依） */
import type { SectionInput } from './sections';
import type { Theme } from './theme';

export type TemplateCategory = 'image' | 'shop' | 'course' | 'brand' | 'service';
export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string; desc: string }[] = [
  { id: 'image', label: '形象', desc: '企業／公司官網、產品登陸頁' },
  { id: 'shop', label: '電商', desc: '線上商店、品牌購物' },
  { id: 'course', label: '課程', desc: '線上課程、講師、學院、會員專區' },
  { id: 'brand', label: '品牌', desc: '個人品牌、工作室、作品集、生活風格' },
  { id: 'service', label: '專業服務', desc: '事務所、顧問、診所、代操代營運' },
];

export interface TemplateMenuItem { label: string; href: string; children?: TemplateMenuItem[] }
export interface TemplatePage { slug: string; title: string; excerpt?: string; sections: SectionInput[] }
export interface SiteTemplate {
  id: string;
  category: TemplateCategory;
  name: string;
  /** 風格詞（現代／深色／編輯…） */
  style: string;
  tagline: string;
  tags: string[];
  /** 骨架靈感（只記來源類型，不含素材） */
  source?: string;
  theme: Partial<Theme>;
  menu: { header: TemplateMenuItem[]; footer: TemplateMenuItem[] };
  home: SectionInput[];
  pages: TemplatePage[];
}


/** 常用選單（各套可覆寫） */
export const MENU = {
  footerBasic: [{ label: '關於我們', href: '/p/about' }, { label: '聯絡我們', href: '/p/contact' }, { label: '會員中心', href: '/member' }],
  footerShop: [{ label: '關於品牌', href: '/p/about' }, { label: '購物須知', href: '/p/faq' }, { label: '聯絡客服', href: '/p/contact' }, { label: '會員中心', href: '/member' }],
  footerCourse: [{ label: '關於我們', href: '/p/about' }, { label: '常見問題', href: '/p/faq' }, { label: '聯絡我們', href: '/p/contact' }, { label: '我的課程', href: '/member' }],
};

/** 常用子頁（各套可覆寫） */
export const PAGES = {
  contact: (extra: Partial<SectionInput> = {}): TemplatePage => ({ slug: 'contact', title: '聯絡我們', sections: [{ kind: 'hero', variant: 'center', title: '聯絡我們', subtitle: '留下需求，我們會在一個工作天內回覆', compact: true, ...(extra.tone ? { tone: extra.tone } : {}) } as SectionInput, { kind: 'contact', variant: 'cards', showForm: false, items: [{ icon: '✉️', label: 'Email', value: 'hello@example.com', href: 'mailto:hello@example.com' }, { icon: '📞', label: '電話', value: '02-0000-0000', href: 'tel:+886200000000' }, { icon: '💬', label: 'LINE', value: '@yourbrand', href: '' }], ...extra } as SectionInput] }),
  faq: (items: { q: string; a: string }[]): TemplatePage => ({ slug: 'faq', title: '常見問題', sections: [{ kind: 'hero', variant: 'center', title: '常見問題', compact: true }, { kind: 'faq', items }] }),
};

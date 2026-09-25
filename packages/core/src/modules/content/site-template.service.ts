import { BadRequestException, Injectable, Logger } from '../../compat';
import { Prisma, PrismaClient } from '@prisma/client';
import { SETTING_KEYS, TEMPLATE_CATEGORIES, getSiteTemplate, listSiteTemplates, sectionsFallbackHtml, sectionsInputSchema, themeSchema, themeToSettings, type Section, type SiteTemplate, type TemplateCategory, type TemplateMenuItem, SITE_TEMPLATES } from '@sitekit/shared';
import { SettingsService } from '../settings/settings.service';
import { MenuService } from './menu.service';
import { SiteService } from './site.service';

/**
 * 快速套版：把 packages/shared 的 50 套版型套到站台。
 * 套用＝①settings：theme.*（＋brand.primaryColor 跟 accent）②首頁區塊 home.sections ③選單 header／footer 整棵覆寫
 *       ④子頁：Content type=page、slug 冪等、design={ kind:'sections', sections }、直接 published（版本 +1、同步草稿）
 * 不動：商品、課程、文章、會員、訂單、品牌名稱／Logo／聯絡資料（這些是站主的內容，不屬於版型）。
 * 可逆：第一次套版前把目前 theme／home.sections／選單存成 settings `template.backup`（一份，之後換版型不覆蓋），apply({ restore: true }) 回到套版前。
 */
/** 一鍵建站的品牌資料：只把使用者給的值寫進區塊佔位（品牌名／標語／Email／電話），沒給的一律不動、不杜撰 */
export interface Personalize { brandName?: string; tagline?: string; contactEmail?: string; phone?: string; address?: string }
export function personalizeSections(sections: Section[], p: Personalize | undefined, isHome: boolean): Section[] {
  if (!p) return sections;
  let heroDone = false;
  return sections.map((s) => {
    const x = JSON.parse(JSON.stringify(s)) as Section & Record<string, unknown>;
    if (x.kind === 'hero' && isHome && !heroDone) {
      heroDone = true;
      if (p.brandName) x.kicker = p.brandName;
      if (p.tagline) x.subtitle = p.tagline;
    }
    if (x.kind === 'contact' && Array.isArray(x.items)) {
      x.items = (x.items as { icon: string; label: string; value: string; href: string }[]).map((it) => {
        if (p.contactEmail && (/email|信箱|mail/i.test(it.label) || it.icon === 'mail')) return { ...it, value: p.contactEmail, href: `mailto:${p.contactEmail}` };
        if (p.phone && (/電話|phone|tel/i.test(it.label) || it.icon === 'phone')) return { ...it, value: p.phone, href: `tel:${p.phone.replace(/[^\d+]/g, '')}` };
        if (p.address && (/地址|address|門市/i.test(it.label) || it.icon === 'map-pin')) return { ...it, value: p.address };
        return it;
      });
    }
    return x as Section;
  });
}

/** 行業關鍵字 → 分類（一鍵建站挑版型用；找不到就回 undefined 讓呼叫端要求指定） */
const INDUSTRY_HINTS: [RegExp, TemplateCategory][] = [
  [/課程|教學|學院|講師|補習|線上課|培訓|學習/, 'course'],
  [/電商|商店|購物|賣|零售|選物|服飾|保養|美妝|食品|烘焙|甜點|咖啡豆|文具|3c|家具|寵物用品/i, 'shop'],
  [/事務所|律師|會計|顧問|診所|牙醫|醫美|保險|代操|代營運|行銷公司|設計公司|工作室服務|裝潢|房仲|不動產|清潔|搬家/, 'service'],
  [/個人品牌|創作者|部落客|攝影師|作品集|插畫|生活風格|網紅|youtuber|podcast|自媒體/i, 'brand'],
  [/公司|企業|集團|製造|工廠|科技|軟體|app|新創|品牌官網|形象/i, 'image'],
];

@Injectable()
export class SiteTemplateService {
  private readonly log = new Logger(SiteTemplateService.name);
  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
    private readonly menu: MenuService,
    private readonly site: SiteService,
  ) {}

  list(category?: string) {
    const cat = TEMPLATE_CATEGORIES.some((c) => c.id === category) ? (category as TemplateCategory) : undefined;
    return { categories: TEMPLATE_CATEGORIES, templates: listSiteTemplates(cat) };
  }

  get(id: string): SiteTemplate {
    const t = getSiteTemplate(id);
    if (!t) throw new BadRequestException(`unknown site template: ${id}`);
    return t;
  }

  /** 目前套用的版型 id（settings template.current） */
  async current() {
    const all = await this.settings.all();
    return { id: all.get('template.current') ?? '', appliedAt: all.get('template.appliedAt') ?? '', hasBackup: !!all.get('template.backup') };
  }

  private async setSettings(values: Record<string, string>) {
    for (const [key, value] of Object.entries(values)) await this.prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value, isSecret: false } });
    this.settings.invalidate();
  }

  private menuItems(items: TemplateMenuItem[]): { label: string; kind: 'route' | 'link'; href: string; children?: { label: string; kind: 'route' | 'link'; href: string }[] }[] {
    const one = (i: TemplateMenuItem) => ({ label: i.label, kind: (i.href.startsWith('/') || i.href.startsWith('#') ? 'route' : 'link') as 'route' | 'link', href: i.href.startsWith('#') ? `/${i.href}` : i.href });
    return items.map((i) => ({ ...one(i), ...(i.children?.length ? { children: i.children.map(one) } : {}) }));
  }

  /** 套用（confirm 必須為 true）；restore=true 改為還原上一份備份 */
  async apply(id: string, actor: string, opts: { confirm?: boolean; restore?: boolean; pages?: boolean; menu?: boolean; personalize?: Personalize } = {}) {
    if (!opts.confirm) throw new BadRequestException('套版會覆寫主題、首頁區塊、選單與同名頁面，請加 confirm=true');
    if (opts.restore) return this.restore(actor);
    const t = this.get(id);
    const all = await this.settings.all();
    // 備份只在「尚未套版」時建立：連續換版型或重套同版型都保留最初（站主自己的）狀態，restore 一律回到套版前
    const keepBackup = !!all.get('template.current') && !!all.get('template.backup');
    const backup = keepBackup ? null : { theme: Object.fromEntries([...all].filter(([k]) => k.startsWith('theme.'))), homeSections: all.get(SETTING_KEYS.homeSections) ?? '', brandPrimary: all.get(SETTING_KEYS.brandPrimaryColor) ?? '', header: await this.menu.tree(false, 'header'), footer: await this.menu.tree(false, 'footer'), at: new Date().toISOString() };
    const theme = themeSchema.parse(t.theme);
    const home = personalizeSections(sectionsInputSchema.parse({ sections: t.home }).sections, opts.personalize, true);
    await this.setSettings({ ...themeToSettings(theme), [SETTING_KEYS.brandPrimaryColor]: theme.accent, 'template.current': t.id, 'template.appliedAt': new Date().toISOString(), ...(backup ? { 'template.backup': JSON.stringify(backup) } : {}) });
    await this.site.setHomeSections({ sections: home });
    if (opts.menu !== false) {
      await this.menu.replace({ items: this.menuItems(t.menu.header) }, 'header');
      await this.menu.replace({ items: this.menuItems(t.menu.footer) }, 'footer');
    }
    const pages: string[] = [];
    if (opts.pages !== false) {
      for (const p of t.pages) {
        const sections = personalizeSections(sectionsInputSchema.parse({ sections: p.sections }).sections, opts.personalize, false);
        const design = { kind: 'sections', sections, template: t.id } as unknown as Prisma.InputJsonValue;
        const body = sectionsFallbackHtml(sections);
        const existing = await this.prisma.content.findUnique({ where: { slug: p.slug }, select: { id: true, version: true, type: true } });
        if (existing && existing.type !== 'page') {
          this.log.warn(`slug ${p.slug} 已被 ${existing.type} 使用，略過`);
          continue;
        }
        const data = { title: p.title, excerpt: p.excerpt ?? null, body, design, status: 'published' as const, publishedAt: new Date(), type: 'page' };
        const c = existing
          ? await this.prisma.content.update({ where: { id: existing.id }, data: { ...data, version: existing.version + 1 } })
          : await this.prisma.content.create({ data: { ...data, slug: p.slug, source: 'template', externalId: `${t.id}:${p.slug}`, version: 1 } });
        await this.prisma.contentDraft.upsert({ where: { contentId: c.id }, update: { title: p.title, slug: p.slug, excerpt: p.excerpt ?? null, body, design, updatedBy: actor }, create: { contentId: c.id, title: p.title, slug: p.slug, excerpt: p.excerpt ?? null, body, design, updatedBy: actor } });
        pages.push(p.slug);
      }
    }
    this.settings.invalidate();
    return { id: t.id, name: t.name, category: t.category, theme, homeSections: home.length, pages, menu: opts.menu !== false };
  }

  /** 依行業／風格／關鍵字推薦版型：分類（指定 > 行業關鍵字）內以 tags／name／style／tagline 命中數計分 */
  recommend(input: { category?: string; industry?: string; style?: string; keywords?: string[] }) {
    const text = [input.industry, input.style, ...(input.keywords ?? [])].filter(Boolean).join(' ');
    const category = (TEMPLATE_CATEGORIES.some((c) => c.id === input.category) ? (input.category as TemplateCategory) : undefined) ?? INDUSTRY_HINTS.find(([re]) => re.test(text))?.[1];
    const pool = SITE_TEMPLATES.filter((t) => !category || t.category === category);
    const terms = text.split(/[\s，,、／/]+/).map((x) => x.trim()).filter((x) => x.length >= 2);
    const score = (t: SiteTemplate) => {
      const hay = [t.name, t.style, t.tagline, ...t.tags, t.source ?? ''].join(' ');
      let n = 0;
      for (const w of terms) {
        if (t.tags.some((g) => g.includes(w) || w.includes(g))) n += 3;
        else if (hay.includes(w)) n += 1;
      }
      if (input.style && t.style.includes(input.style)) n += 2;
      return n;
    };
    const ranked = pool.map((t) => ({ t, n: score(t) })).sort((a, b) => b.n - a.n);
    const summary = (t: SiteTemplate) => ({ id: t.id, name: t.name, category: t.category, style: t.style, tagline: t.tagline, tags: t.tags, pages: t.pages.map((p) => p.slug) });
    return { category, picked: ranked[0] ? { ...summary(ranked[0].t), score: ranked[0].n } : null, alternatives: ranked.slice(1, 4).map((r) => ({ ...summary(r.t), score: r.n })), matchedTerms: terms };
  }

  /**
   * 一鍵建站（confirm 必須為 true）：挑版型（templateId 或依行業／風格推薦）→ 套用（含品牌資料寫進 hero／聯絡區塊）→ 更新品牌設定（只寫有給的）→ 主題（accent／mode 有給才改）。
   * 不產圖、不杜撰文案；回傳摘要與下一步建議（產圖、補文案、預覽）。
   */
  async quickSetup(input: { confirm?: boolean; templateId?: string; category?: string; industry?: string; style?: string; keywords?: string[]; brandName?: string; siteName?: string; tagline?: string; description?: string; contactEmail?: string; phone?: string; address?: string; accent?: string; mode?: 'light' | 'dark' }, actor: string) {
    if (!input.confirm) throw new BadRequestException('一鍵建站會套用版型並覆寫主題、首頁、選單與同名子頁，請加 confirm=true');
    const rec = input.templateId ? null : this.recommend(input);
    const id = input.templateId ?? rec?.picked?.id;
    if (!id) throw new BadRequestException('找不到適合的版型：請指定 templateId，或給 category（image|shop|course|brand|service）／行業描述');
    const personalize: Personalize = { brandName: input.brandName, tagline: input.tagline, contactEmail: input.contactEmail, phone: input.phone, address: input.address };
    const applied = await this.apply(id, actor, { confirm: true, personalize });
    if (!('id' in applied)) throw new BadRequestException('套版失敗');
    const brand: Record<string, string> = {};
    if (input.brandName) brand[SETTING_KEYS.brandName] = input.brandName;
    if (input.siteName || input.brandName) brand[SETTING_KEYS.brandSiteName] = input.siteName ?? input.brandName!;
    if (input.tagline) brand['brand.tagline'] = input.tagline;
    if (input.description) brand[SETTING_KEYS.brandDescription] = input.description;
    if (input.contactEmail) brand['brand.contactEmail'] = input.contactEmail;
    if (input.phone) brand['brand.phone'] = input.phone;
    if (input.address) brand['brand.address'] = input.address;
    if (input.accent && /^#[0-9a-fA-F]{6}$/.test(input.accent)) brand[SETTING_KEYS.brandPrimaryColor] = input.accent;
    if (input.mode === 'light' || input.mode === 'dark') brand['theme.mode'] = input.mode;
    if (Object.keys(brand).length) await this.setSettings(brand);
    return {
      template: { id: applied.id, name: applied.name, category: applied.category },
      recommendation: rec ? { category: rec.category, alternatives: rec.alternatives, matchedTerms: rec.matchedTerms } : null,
      homeSections: applied.homeSections,
      pages: applied.pages,
      brandUpdated: Object.keys(brand),
      personalized: Object.entries(personalize).filter(([, v]) => v).map(([k]) => k),
      next: ['到首頁預覽（前台約 60 秒內更新）', '首頁 hero 標題與各區塊文案仍是版型佔位，請用「首頁區塊」項目或後台「首頁版面」填入', '需要主視覺／商品圖可用「商品製圖與 Banner」產圖後回填 imageUrl', '不滿意可 apply_site_template restore=true 一鍵還原'],
    };
  }

  /** 還原套版前的主題／首頁區塊／選單（頁面不刪，站主自行處理） */
  async restore(actor: string) {
    const all = await this.settings.all();
    const raw = all.get('template.backup');
    if (!raw) throw new BadRequestException('沒有可還原的備份');
    const b = JSON.parse(raw) as { theme: Record<string, string>; homeSections: string; brandPrimary?: string; header: unknown[]; footer: unknown[]; at: string };
    for (const key of [...all.keys()].filter((k) => k.startsWith('theme.'))) await this.prisma.setting.deleteMany({ where: { key } });
    await this.setSettings({ ...b.theme, [SETTING_KEYS.brandPrimaryColor]: b.brandPrimary ?? '', 'template.current': '', 'template.appliedAt': '', 'template.backup': '' });
    await this.prisma.setting.upsert({ where: { key: SETTING_KEYS.homeSections }, update: { value: b.homeSections }, create: { key: SETTING_KEYS.homeSections, value: b.homeSections, isSecret: false } });
    const toInput = (nodes: unknown[]): unknown[] => (nodes as { label: string; kind?: string; href: string; contentId?: string; isVisible?: boolean; newTab?: boolean; children?: unknown[] }[]).map((n) => ({ label: n.label, kind: n.kind ?? (n.href?.startsWith('/') ? 'route' : 'link'), href: n.href, ...(n.contentId ? { contentId: n.contentId } : {}), isVisible: n.isVisible ?? true, newTab: n.newTab ?? false, children: n.children?.length ? toInput(n.children) : [] }));
    await this.menu.replace({ items: toInput(b.header) }, 'header');
    await this.menu.replace({ items: toInput(b.footer) }, 'footer');
    this.settings.invalidate();
    this.log.log(`template restored by ${actor} (backup ${b.at})`);
    return { restored: true, backupAt: b.at };
  }
}

import { BadRequestException, Injectable, Logger } from '../../compat';
import { Prisma, PrismaClient } from '@prisma/client';
import { SETTING_KEYS, TEMPLATE_CATEGORIES, getSiteTemplate, listSiteTemplates, sectionsInputSchema, themeSchema, themeToSettings, type Section, type SiteTemplate, type TemplateCategory, type TemplateMenuItem } from '@sitekit/shared';
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

  /** 區塊頁的後備 HTML（無 JS／RSS／搜尋引擎摘要用；前台以 SectionRenderer 渲染 design.sections） */
  private fallbackHtml(sections: Section[]): string {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
    const parts: string[] = [];
    for (const s of sections) {
      const title = 'title' in s && s.title ? `<h2>${esc(s.title)}</h2>` : '';
      const sub = 'subtitle' in s && s.subtitle ? `<p>${esc(s.subtitle)}</p>` : '';
      const text = 'text' in s && typeof s.text === 'string' && s.text ? `<p>${esc(s.text)}</p>` : '';
      const items = 'items' in s && Array.isArray(s.items) ? `<ul>${(s.items as Record<string, string>[]).map((i) => `<li>${esc(i.title ?? i.label ?? i.q ?? i.name ?? i.value ?? '')}${i.text ? `：${esc(i.text)}` : i.a ? `：${esc(i.a)}` : ''}</li>`).join('')}</ul>` : '';
      parts.push(`<section>${title}${sub}${text}${items}</section>`);
    }
    return parts.join('\n');
  }

  /** 套用（confirm 必須為 true）；restore=true 改為還原上一份備份 */
  async apply(id: string, actor: string, opts: { confirm?: boolean; restore?: boolean; pages?: boolean; menu?: boolean } = {}) {
    if (!opts.confirm) throw new BadRequestException('套版會覆寫主題、首頁區塊、選單與同名頁面，請加 confirm=true');
    if (opts.restore) return this.restore(actor);
    const t = this.get(id);
    const all = await this.settings.all();
    // 備份只在「尚未套版」時建立：連續換版型或重套同版型都保留最初（站主自己的）狀態，restore 一律回到套版前
    const keepBackup = !!all.get('template.current') && !!all.get('template.backup');
    const backup = keepBackup ? null : { theme: Object.fromEntries([...all].filter(([k]) => k.startsWith('theme.'))), homeSections: all.get(SETTING_KEYS.homeSections) ?? '', header: await this.menu.tree(false, 'header'), footer: await this.menu.tree(false, 'footer'), at: new Date().toISOString() };
    const theme = themeSchema.parse(t.theme);
    const home = sectionsInputSchema.parse({ sections: t.home }).sections;
    await this.setSettings({ ...themeToSettings(theme), [SETTING_KEYS.brandPrimaryColor]: theme.accent, 'template.current': t.id, 'template.appliedAt': new Date().toISOString(), ...(backup ? { 'template.backup': JSON.stringify(backup) } : {}) });
    await this.site.setHomeSections({ sections: home });
    if (opts.menu !== false) {
      await this.menu.replace({ items: this.menuItems(t.menu.header) }, 'header');
      await this.menu.replace({ items: this.menuItems(t.menu.footer) }, 'footer');
    }
    const pages: string[] = [];
    if (opts.pages !== false) {
      for (const p of t.pages) {
        const sections = sectionsInputSchema.parse({ sections: p.sections }).sections;
        const design = { kind: 'sections', sections, template: t.id } as unknown as Prisma.InputJsonValue;
        const body = this.fallbackHtml(sections);
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

  /** 還原套版前的主題／首頁區塊／選單（頁面不刪，站主自行處理） */
  async restore(actor: string) {
    const all = await this.settings.all();
    const raw = all.get('template.backup');
    if (!raw) throw new BadRequestException('沒有可還原的備份');
    const b = JSON.parse(raw) as { theme: Record<string, string>; homeSections: string; header: unknown[]; footer: unknown[]; at: string };
    for (const key of [...all.keys()].filter((k) => k.startsWith('theme.'))) await this.prisma.setting.deleteMany({ where: { key } });
    await this.setSettings({ ...b.theme, 'template.current': '', 'template.appliedAt': '', 'template.backup': '' });
    await this.prisma.setting.upsert({ where: { key: SETTING_KEYS.homeSections }, update: { value: b.homeSections }, create: { key: SETTING_KEYS.homeSections, value: b.homeSections, isSecret: false } });
    const toInput = (nodes: unknown[]): unknown[] => (nodes as { label: string; kind?: string; href: string; contentId?: string; isVisible?: boolean; newTab?: boolean; children?: unknown[] }[]).map((n) => ({ label: n.label, kind: n.kind ?? (n.href?.startsWith('/') ? 'route' : 'link'), href: n.href, ...(n.contentId ? { contentId: n.contentId } : {}), isVisible: n.isVisible ?? true, newTab: n.newTab ?? false, children: n.children?.length ? toInput(n.children) : [] }));
    await this.menu.replace({ items: toInput(b.header) }, 'header');
    await this.menu.replace({ items: toInput(b.footer) }, 'footer');
    this.settings.invalidate();
    this.log.log(`template restored by ${actor} (backup ${b.at})`);
    return { restored: true, backupAt: b.at };
  }
}

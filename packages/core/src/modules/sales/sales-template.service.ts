import { BadRequestException, Injectable } from '../../compat';
import { PrismaClient } from '@prisma/client';
import { TEMPLATE_CATEGORIES, getSalesTemplate, listSalesTemplates, type TemplateCategory } from '@sitekit/shared';
import { SalesService } from './sales.service';

/**
 * 一頁式網頁套版：25 套（五分類 × 5 風格配色）→ 建立／覆寫銷售頁「草稿」（不發佈）。
 * 套用＝content（內文設計文件）＋theme＋sections 順序與標題＋notice＋display＋contentOptions；不動 items（掛商品）、表單、追蹤、SEO、排程。
 */
@Injectable()
export class SalesTemplateService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sales: SalesService,
  ) {}

  list(category?: string) {
    const cat = TEMPLATE_CATEGORIES.some((c) => c.id === category) ? (category as TemplateCategory) : undefined;
    return { categories: TEMPLATE_CATEGORIES, templates: listSalesTemplates(cat) };
  }

  get(id: string) {
    const t = getSalesTemplate(id);
    if (!t) throw new BadRequestException(`unknown sales template: ${id}`);
    return t;
  }

  /** 套到既有銷售頁（slug／id）或建立新頁（slug 不存在時用 title 建）；confirm 必填（會覆寫內文與主題） */
  async apply(id: string, input: { slug?: string; title?: string; code?: string; confirm?: boolean }, actor: string) {
    if (!input.confirm) throw new BadRequestException('套版會覆寫該銷售頁的內文、主題、區塊順序與通知列（草稿），請加 confirm=true');
    const t = this.get(id);
    const slug = String(input.slug ?? '').trim();
    let page = slug ? await this.prisma.salesPage.findUnique({ where: { slug } }) : null;
    let created = false;
    if (!page) {
      const r = await this.sales.create({ title: String(input.title ?? t.name), ...(slug ? { slug } : {}), ...(input.code ? { code: String(input.code) } : {}) }, actor);
      page = await this.prisma.salesPage.findUnique({ where: { id: r.page.id } });
      created = true;
    }
    if (!page) throw new BadRequestException('sales page not found');
    const doc = t.doc();
    const r = await this.sales.saveDraft(page.id, { ...(input.title && !created ? { title: String(input.title) } : {}), doc }, actor);
    return { id: page.id, slug: r.page.slug, created, template: { id: t.id, name: t.name, category: t.category, style: t.style }, blocks: t.blocks, preview: r.preview, url: `/s/${r.page.slug}`, next: ['到後台「一頁式網頁」編輯文案與圖片（目前為佔位）', '掛上商品（優惠／組合／單品／加購）', '沙盒預覽後確認發佈'] };
  }
}

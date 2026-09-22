import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OPS_ACTIONS, OPS_ACTION_KEYS, type OpsAction, type OpsResult } from '@sitekit/shared';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { MigrationService } from '../migration/migration.service';
import { SettingsService } from '../settings/settings.service';
import { CreditsService } from '../credits/credits.service';
import { CatalogService } from '../catalog/catalog.service';
import { CouponsService } from '../orders/coupons.service';
import { OrdersService } from '../orders/orders.service';
import { ReportsService } from '../orders/reports.service';
import { NotifyService } from '../notify/notify.service';
import { StorageService } from '../storage/storage.service';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { sanitizeHtml } from '../migration/normalize';
import { MenuService, parseLocation } from '../content/menu.controller';
import { SiteService } from '../content/site.controller';
import { LogisticsService } from '../logistics/logistics.service';
import { InvoiceService } from '../invoice/invoice.service';
import { DesignService } from '../content/design.service';
import { getProvider } from '../studio/providers';
import { composeTemplatePrompt, StudioService } from '../studio/studio.service';
import { SalesService } from '../sales/sales.service';

const SECRET_KEY = /secret|key|token|password|hashiv|hash_iv|signing/i;
const SECRET_PARAM = /^(password|apiKey)$/i;

/**
 * 後台維運執行層：MCP 路徑與 AI API 路徑共用的唯一入口。
 * 設定存 settings 表、每次會改動狀態的操作都寫 audit_logs。
 */
@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly migration: MigrationService,
    private readonly settings: SettingsService,
    private readonly credits: CreditsService,
    private readonly orders: OrdersService,
    private readonly coupons: CouponsService,
    private readonly reports: ReportsService,
    private readonly catalog: CatalogService,
    private readonly notify: NotifyService,
    private readonly storage: StorageService,
    private readonly admins: AdminAuthService,
    private readonly menu: MenuService,
    private readonly site: SiteService,
    private readonly logistics: LogisticsService,
    private readonly invoice: InvoiceService,
    private readonly design: DesignService,
    private readonly studio: StudioService,
    private readonly sales: SalesService,
  ) {}

  listActions() {
    return OPS_ACTION_KEYS.map((k) => ({ action: k, ...OPS_ACTIONS[k] }));
  }

  async run(action: string, params: Record<string, unknown> | undefined, actor: string): Promise<OpsResult> {
    if (!OPS_ACTION_KEYS.includes(action as OpsAction)) throw new BadRequestException('unknown action: ' + action);
    const a = action as OpsAction;
    const base = { action: a, actor, at: new Date().toISOString() };
    const p = params ?? {};
    try {
      const data = await this.execute(a, p, actor);
      if (OPS_ACTIONS[a].mutating) await this.log(actor, a, p, true, data);
      return { ok: true, ...base, data };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await this.log(actor, a, p, false, undefined, error);
      return { ok: false, ...base, error };
    }
  }

  private async log(actor: string, action: string, params: Record<string, unknown>, ok: boolean, result?: unknown, error?: string) {
    const safeParams: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (k === 'csv') safeParams[k] = '<csv omitted>';
      else if (k === 'settings' && v && typeof v === 'object') safeParams[k] = Object.fromEntries(Object.keys(v as object).map((key) => [key, SECRET_KEY.test(key) ? '****' : (v as Record<string, unknown>)[key]]));
      else if (SECRET_PARAM.test(k)) safeParams[k] = '****';
      else safeParams[k] = v;
    }
    await this.prisma.auditLog.create({
      data: { actor, action, ok, error, params: safeParams as Prisma.InputJsonValue, result: (result ?? null) as Prisma.InputJsonValue },
    });
  }

  private async execute(action: OpsAction, p: Record<string, unknown>, actor = 'ops'): Promise<unknown> {
    switch (action) {
      case 'status': {
        const [users, contents, orders, paid, lastDeploy, provider, paymentMethods] = await Promise.all([
          this.prisma.user.count(),
          this.prisma.content.count({ where: { status: 'published' } }),
          this.prisma.order.count(),
          this.prisma.order.count({ where: { status: 'paid' } }),
          this.prisma.auditLog.findFirst({ where: { action: 'deploy', ok: true }, orderBy: { createdAt: 'desc' } }),
          this.settings.paymentProvider(),
          this.settings.paymentMethods(),
        ]);
        return {
          env: env.APP_ENV,
          version: '0.2.0',
          counts: { users, publishedContents: contents, orders, paidOrders: paid },
          paymentProvider: provider,
          paymentMethods,
          lastDeployAt: lastDeploy?.createdAt ?? null,
          services: { api: 'up', db: 'connected', redis: env.REDIS_URL ? 'configured' : 'not-configured' },
        };
      }
      case 'deploy': {
        const target = String(p.target ?? 'all');
        if (!['web', 'api', 'all'].includes(target)) throw new Error('target must be web / api / all');
        return { queued: true, target, note: 'deploy platform API (Zeabur) not wired yet; recorded in audit' };
      }
      case 'migrate':
        return { queued: true, note: 'run `npm run db:migrate` on the api service; recorded in audit' };
      case 'get_settings': {
        const rows = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
        return Object.fromEntries(rows.map((r) => [r.key, r.isSecret ? '****' : r.value]));
      }
      case 'update_settings': {
        const entries = Object.entries((p.settings as Record<string, unknown>) ?? {});
        if (!entries.length) throw new Error('settings must not be empty');
        for (const [key, v] of entries) {
          const value = String(v);
          await this.prisma.setting.upsert({
            where: { key },
            update: { value },
            create: { key, value, isSecret: SECRET_KEY.test(key) },
          });
        }
        this.settings.invalidate();
        return { updated: entries.map(([k]) => k) };
      }
      case 'import_content':
        return this.migration.run(p);
      case 'adjust_credits': {
        const amount = Number(p.amount);
        if (!Number.isInteger(amount) || amount === 0) throw new Error('amount must be a non-zero integer');
        const user = await this.credits.findUser(String(p.userId ?? p.email ?? ''));
        const r = await this.credits.adjust(user.id, amount, String(p.reason ?? 'ops adjust'), 'ops');
        return { userId: user.id, email: user.email, ...r };
      }
      case 'audit': {
        const rows = await this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(Number(p.limit ?? 50), 200) });
        return rows;
      }
      case 'sales_report':
        return this.reports.sales(p);
      case 'list_products': {
        const rows = await this.catalog.listProductsAdmin();
        const q = String(p.q ?? '').trim().toLowerCase();
        const limit = Math.min(200, Math.max(1, Number(p.limit) || 100));
        return rows
          .filter((r) => (!p.type || r.type === p.type) && (!p.category || r.category === p.category) && (p.isActive === undefined || r.isActive === (p.isActive === true || p.isActive === 'true')) && (!q || `${r.sku} ${r.name} ${r.description ?? ''} ${r.category ?? ''}`.toLowerCase().includes(q)))
          .slice(0, limit)
          .map((r) => ({ id: r.id, sku: r.sku, type: r.type, name: r.name, price: r.price, stock: r.stock, isActive: r.isActive, category: r.category, coverUrl: r.coverUrl, sold: r._count.items, courseSlug: r.course?.slug ?? null, description: r.description?.slice(0, 200) ?? null }));
      }
      case 'upsert_product': {
        const sku = String(p.sku ?? '').trim();
        if (!sku) throw new Error('sku is required');
        const existing = await this.prisma.product.findUnique({ where: { sku } });
        const fields: Record<string, unknown> = {};
        for (const k of ['type', 'name', 'description', 'coverUrl', 'isActive', 'category'] as const) if (p[k] !== undefined) fields[k] = p[k];
        for (const k of ['price', 'stock', 'sortOrder'] as const) if (p[k] !== undefined && p[k] !== null) fields[k] = Math.round(Number(p[k]));
        if (p.stock === null) fields.stock = null;
        if (existing) {
          const u = await this.catalog.updateProduct(existing.id, fields);
          return { id: u.id, sku: u.sku, name: u.name, price: u.price, isActive: u.isActive, category: u.category, coverUrl: u.coverUrl, stock: u.stock, created: false };
        }
        const c = await this.catalog.createProduct({ type: 'physical', ...fields, sku });
        return { id: c.id, sku: c.sku, name: c.name, price: c.price, isActive: c.isActive, category: c.category, coverUrl: c.coverUrl, stock: c.stock, created: true };
      }
      case 'list_orders': {
        const rows = await this.orders.listAll(p.status ? String(p.status) : undefined, p.shipping ? String(p.shipping) : undefined);
        const from = p.from ? new Date(String(p.from)) : null;
        const to = p.to ? new Date(String(p.to)) : null;
        if (to && String(p.to).length <= 10) to.setHours(23, 59, 59, 999);
        const q = String(p.q ?? '').trim().toLowerCase();
        const limit = Math.min(200, Math.max(1, Number(p.limit) || 50));
        return rows
          .filter((o) => (!from || o.createdAt >= from) && (!to || o.createdAt <= to) && (!q || `${o.merchantOrderNo} ${o.user?.email ?? ''}`.toLowerCase().includes(q)))
          .slice(0, limit)
          .map((o) => ({ orderNo: o.merchantOrderNo, status: o.status, amount: o.amount, provider: o.provider, shippingStatus: o.shippingStatus, shippingMethod: o.shippingMethod, carrier: o.carrier, trackingNo: o.trackingNo, email: o.user?.email ?? null, items: o.items.map((i) => `${i.name}×${i.qty}`).join(', '), createdAt: o.createdAt, paidAt: o.paidAt ?? null }));
      }
      case 'get_order':
        return this.orders.findByIdOrNo(String(p.orderNo ?? p.id ?? ''));
      case 'list_courses': {
        const rows = await this.catalog.listAllCourses();
        return (rows as unknown as { id: string; slug: string; summary: string | null; isPublished: boolean; product: { sku: string; name: string; price: number; coverUrl: string | null; isActive: boolean }; _count?: { chapters: number } }[]).map((c) => ({ id: c.id, slug: c.slug, name: c.product.name, sku: c.product.sku, price: c.product.price, isPublished: c.isPublished, isActive: c.product.isActive, coverUrl: c.product.coverUrl, chapters: c._count?.chapters ?? null, summary: c.summary }));
      }
      case 'upsert_course': {
        const slug = String(p.slug ?? '').trim();
        if (!slug) throw new Error('slug is required');
        const existing = await this.prisma.course.findUnique({ where: { slug }, include: { product: true } });
        const prod = (p.product && typeof p.product === 'object' ? { ...(p.product as Record<string, unknown>) } : {}) as Record<string, unknown>;
        for (const k of ['name', 'price', 'description', 'coverUrl', 'sku', 'isActive'] as const) if (p[k] !== undefined && prod[k] === undefined) prod[k] = p[k];
        if (prod.price !== undefined) prod.price = Math.round(Number(prod.price));
        const course = { summary: p.summary, isPublished: p.isPublished === undefined ? undefined : p.isPublished === true || p.isPublished === 'true', accessMode: p.accessMode, accessDays: p.accessDays };
        const clean = Object.fromEntries(Object.entries(course).filter(([, v]) => v !== undefined));
        if (existing) {
          const u = await this.catalog.updateCourse(existing.id, { ...clean, ...(Object.keys(prod).length ? { product: prod } : {}) });
          return { id: u.id, slug: u.slug, name: u.product.name, price: u.product.price, isPublished: u.isPublished, created: false };
        }
        if (!prod.name || prod.price === undefined) throw new Error('建立課程需要 name 與 price');
        const c = await this.catalog.createCourse({ slug, ...clean, product: { sku: prod.sku ?? `COURSE-${slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 40)}`, ...prod } });
        return { id: c.id, slug: c.slug, name: c.product.name, price: c.product.price, isPublished: c.isPublished, created: true };
      }
      case 'add_chapter': {
        const slug = String(p.courseSlug ?? p.slug ?? '').trim();
        const course = await this.prisma.course.findFirst({ where: { OR: [{ slug }, { id: slug }] } });
        if (!course) throw new Error('course not found');
        const ch = await this.catalog.addChapter(course.id, { title: String(p.title ?? '未命名章節'), ...(p.body !== undefined ? { body: String(p.body) } : {}), ...(p.videoProvider ? { videoProvider: p.videoProvider } : {}), ...(p.videoProviderId !== undefined ? { videoProviderId: p.videoProviderId ? String(p.videoProviderId) : null } : {}), ...(p.isPreview !== undefined ? { isPreview: !!p.isPreview } : {}), ...(p.isPublished !== undefined ? { isPublished: !!p.isPublished } : {}), ...(p.parentId ? { parentId: String(p.parentId) } : {}), ...(p.order !== undefined ? { order: Number(p.order) } : {}) });
        return { id: ch.id, courseSlug: course.slug, title: ch.title, order: ch.order, parentId: ch.parentId };
      }
      case 'get_tracking':
        return this.site.tracking();
      case 'set_tracking':
        return this.site.setTracking(p);
      case 'list_sales_pages':
        return this.sales.list();
      case 'get_sales_page':
        return this.sales.present(await this.sales.page(String(p.idOrSlug ?? p.slug ?? p.id ?? '')));
      case 'upsert_sales_page': {
        const slug = String(p.slug ?? '').trim();
        if (!slug) throw new Error('slug is required');
        let page = await this.prisma.salesPage.findUnique({ where: { slug } });
        let created = false;
        if (!page) {
          const r = await this.sales.create({ title: String(p.title ?? slug), slug, ...(p.code ? { code: String(p.code) } : {}) }, actor);
          page = await this.sales.page(r.page.id);
          created = true;
        }
        const r = await this.sales.saveDraft(page.id, { ...(p.title !== undefined ? { title: String(p.title) } : {}), ...(p.code !== undefined ? { code: String(p.code) } : {}), doc: (p.doc && typeof p.doc === 'object' ? p.doc : {}) as Record<string, unknown> }, actor);
        return { id: r.page.id, slug: r.page.slug, status: r.page.status, version: r.page.version, created, savedAs: 'draft', dirty: r.dirty, lint: r.lint, items: r.doc.items.length, preview: r.preview.url, next: '請用 preview_sales_page 沙盒預覽，確認後 publish_sales_page（confirm=true）' };
      }
      case 'preview_sales_page': {
        const page = await this.sales.page(String(p.idOrSlug ?? p.slug ?? p.id ?? ''));
        return { id: page.id, slug: page.slug, ...(await this.sales.previewLink(page.id)) };
      }
      case 'publish_sales_page':
        if (p.unpublish === true || p.unpublish === 'true') return this.sales.unpublish(String(p.idOrSlug ?? p.slug ?? p.id ?? ''));
        return this.sales.publish(String(p.idOrSlug ?? p.slug ?? p.id ?? ''), { confirm: p.confirm === true || p.confirm === 'true', note: p.note ? String(p.note) : undefined }, actor);
      case 'list_sales_revisions':
        return this.sales.revisions(String(p.idOrSlug ?? p.slug ?? p.id ?? ''));
      case 'restore_sales_revision':
        return this.sales.restore(String(p.idOrSlug ?? p.slug ?? p.id ?? ''), Number(p.version), actor);
      case 'list_image_templates': {
        const rows = await this.prisma.aiTemplate.findMany({ where: { isActive: true }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] });
        return rows.map((t) => ({ key: t.key, name: t.name, category: t.category, description: t.description, coverUrl: t.coverUrl, defaultSize: t.defaultSize, inputFields: t.inputFields }));
      }
      case 'upsert_image_template': {
        const key = String(p.key ?? '').trim();
        if (!key) throw new Error('key is required');
        const existing = await this.prisma.aiTemplate.findUnique({ where: { key } });
        let coverUrl: string | undefined;
        if (typeof p.coverBase64 === 'string' && p.coverBase64) {
          const mime = String(p.coverMime ?? 'image/jpeg');
          const bytes = Buffer.from(p.coverBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
          if (bytes.length > 5 * 1024 * 1024) throw new Error('cover must be ≤5MB');
          coverUrl = (await this.storage.put(`ai/templates/${key}.${mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'}`, bytes, mime)).url;
        } else if (typeof p.coverUrl === 'string') coverUrl = p.coverUrl;
        const { coverBase64: _b, coverMime: _m, coverUrl: _u, ...rest } = p;
        const data = { ...rest, key, ...(coverUrl !== undefined ? { coverUrl } : {}) };
        const row = existing ? await this.studio.updateTemplate(existing.id, data) : await this.studio.createTemplate({ name: key, systemPrompt: 'template', ...data });
        return { id: row.id, key: row.key, name: row.name, category: row.category, coverUrl: row.coverUrl, fields: (row.inputFields as unknown[]).length, created: !existing };
      }
      case 'generate_image': {
        let prompt = String(p.prompt ?? '').trim();
        const templateKey = String(p.templateKey ?? '').trim();
        const template = templateKey ? await this.prisma.aiTemplate.findFirst({ where: { OR: [{ key: templateKey }, { id: templateKey }], isActive: true } }) : null;
        if (templateKey && !template) throw new Error(`找不到產圖模板 ${templateKey}（用 list_image_templates 查 key）`);
        if (template) prompt = composeTemplatePrompt(template.systemPrompt, (template.inputFields as { key: string; label: string; type?: string }[]) ?? [], (p.inputs && typeof p.inputs === 'object' ? (p.inputs as Record<string, unknown>) : {}), prompt);
        if (!prompt) throw new Error('prompt or templateKey is required');
        const ai = await this.settings.ai();
        const size = ['1024x1024', '1536x1024', '1024x1536'].includes(String(p.size)) ? String(p.size) : (template?.defaultSize ?? '1024x1024');
        const quality = p.quality === 'high' ? 'high' : 'standard';
        const provider = getProvider(ai.provider);
        const refUrls = Array.isArray(p.referenceImages) ? (p.referenceImages as unknown[]).map(String).filter((u) => /^https?:\/\//.test(u)).slice(0, 4) : [];
        const referenceImages = (await Promise.all(refUrls.map((u) => this.storage.fetchAsset(u)))).filter((x): x is { bytes: Buffer; mime: string } => !!x);
        const img = await provider.generate({ prompt, size, quality, apiKey: ai.openaiKey || undefined, model: ai.imageModel, referenceImages });
        const purpose = ['product', 'banner', 'illustration'].includes(String(p.purpose)) ? String(p.purpose) : 'illustration';
        const put = await this.storage.put(`ai/${purpose}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${img.ext}`, img.bytes, img.mime);
        return { url: put.url, provider: provider.name, size, quality, purpose, template: template?.key ?? null, referenceImages: referenceImages.length, bytes: img.bytes.length, costTwd: img.costTwd ?? null, note: provider.name === 'mock' ? 'mock 供應商（佔位圖）；到系統設定把 ai.provider 改為 openai 並填 openai.apiKey 才是真產圖' : undefined };
      }
      case 'update_shipping': {
        const orderNo = String(p.orderNo ?? p.merchantOrderNo ?? p.orderId ?? '');
        if (!orderNo) throw new Error('orderNo is required');
        const o = await this.orders.updateShipping(orderNo, { status: p.status, carrier: p.carrier ?? undefined, trackingNo: p.trackingNo ?? undefined });
        return { merchantOrderNo: o.merchantOrderNo, shippingStatus: o.shippingStatus, carrier: o.carrier, trackingNo: o.trackingNo, shippedAt: o.shippedAt };
      }
      case 'manage_coupon': {
        const op = String(p.op ?? 'create');
        if (op === 'create') return this.coupons.create(p);
        const code = String(p.code ?? p.id ?? '');
        if (!code) throw new Error('code is required');
        if (op === 'disable') return this.coupons.update(code, { isActive: false });
        if (op === 'update') {
          const { op: _op, code: _code, ...rest } = p;
          return this.coupons.update(code, rest);
        }
        throw new Error('op must be create | update | disable');
      }
      case 'adjust_stock': {
        const ref = String(p.sku ?? p.productId ?? '');
        if (!ref) throw new Error('sku or productId is required');
        if (p.set === undefined && p.delta === undefined) throw new Error('set or delta is required');
        return this.catalog.adjustStock(ref, p.set === undefined ? undefined : p.set === null ? null : Number(p.set), p.delta === undefined ? undefined : Number(p.delta));
      }
      case 'expire_orders':
        return this.orders.expirePending(p.hours === undefined ? undefined : Number(p.hours));
      case 'import_products':
        return this.migration.runProducts(p);
      case 'get_menu':
        return this.menu.tree(false, parseLocation(p.location));
      case 'set_menu':
        return this.menu.replace({ items: p.items ?? [] }, parseLocation(p.location));
      case 'create_logistics_order':
        return this.logistics.createOrder(String(p.orderNo ?? p.merchantOrderNo ?? ''), 'ops');
      case 'issue_invoice': {
        const order = await this.prisma.order.findFirst({ where: { OR: [{ id: String(p.orderNo ?? '') }, { merchantOrderNo: String(p.orderNo ?? '') }] }, include: { items: true, user: { select: { email: true, displayName: true } } } });
        if (!order) throw new Error('order not found');
        const inv = await this.invoice.issue(order, 'ops');
        return { id: inv.id, number: inv.number, status: inv.status, provider: inv.provider };
      }
      case 'invalidate_invoice': {
        const order = await this.prisma.order.findFirst({ where: { OR: [{ id: String(p.orderNo ?? '') }, { merchantOrderNo: String(p.orderNo ?? '') }] } });
        if (!order) throw new Error('order not found');
        const r = await this.invoice.invalidateForOrder(order.id, String(p.reason ?? 'ops 作廢'));
        if (!r) throw new Error('作廢失敗或無已開立發票');
        return { id: r.id, number: r.number, status: r.status };
      }
      case 'list_invoices':
        return this.invoice.list(p.status ? String(p.status) : undefined);
      case 'get_site': {
        const [pub, adm] = await Promise.all([this.site.publicSite(), this.site.adminSite()]);
        return { ...pub, settings: Object.fromEntries(adm.fields.map((f) => [f.key, f.value])) };
      }
      case 'set_home_sections':
        return this.site.setHomeSections({ sections: p.sections ?? [] });
      case 'list_questions': {
        const course = p.slug ? await this.prisma.course.findUnique({ where: { slug: String(p.slug) }, select: { id: true } }) : null;
        const courseId = p.courseId ? String(p.courseId) : course?.id;
        return this.prisma.courseQuestion.findMany({ where: { ...(courseId ? { courseId } : {}), ...(p.status ? { status: String(p.status) } : {}) }, orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, courseId: true, chapterId: true, body: true, answer: true, status: true, isPublic: true, createdAt: true, user: { select: { email: true, displayName: true } }, course: { select: { slug: true } } } });
      }
      case 'answer_question': {
        const id = String(p.id ?? '');
        const answer = String(p.answer ?? '').trim();
        if (!id || !answer) throw new Error('id and answer are required');
        const q = await this.prisma.courseQuestion.findUnique({ where: { id }, include: { user: { select: { email: true, displayName: true } }, course: { select: { slug: true, product: { select: { name: true } } } } } });
        if (!q) throw new Error('question not found');
        const u = await this.prisma.courseQuestion.update({ where: { id }, data: { answer, answeredAt: new Date(), answeredBy: 'ops', status: 'answered', ...(p.isPublic !== undefined ? { isPublic: !!p.isPublic } : {}) } });
        this.notify.questionAnswered({ to: q.user.email, name: q.user.displayName, courseName: q.course.product.name, slug: q.course.slug, question: q.body, answer }).catch(() => undefined);
        return { id: u.id, status: u.status, answeredAt: u.answeredAt };
      }
      case 'post_announcement': {
        const course = p.slug ? await this.prisma.course.findUnique({ where: { slug: String(p.slug) }, select: { id: true } }) : p.courseId ? await this.prisma.course.findUnique({ where: { id: String(p.courseId) }, select: { id: true } }) : null;
        if (!course) throw new Error('course not found (courseId or slug)');
        const title = String(p.title ?? '').trim();
        const body = String(p.body ?? '').trim();
        if (!title || !body) throw new Error('title and body are required');
        const a = await this.prisma.courseAnnouncement.create({ data: { courseId: course.id, title, body } });
        return { id: a.id, courseId: a.courseId, title: a.title, publishedAt: a.publishedAt };
      }
      case 'list_content':
        return this.prisma.content.findMany({ where: { ...(p.type ? { type: String(p.type) } : {}), ...(p.status ? { status: p.status as 'draft' | 'published' | 'archived' } : {}) }, orderBy: { updatedAt: 'desc' }, take: 200, select: { id: true, type: true, title: true, slug: true, status: true, publishedAt: true, updatedAt: true } });
      case 'upsert_content': {
        // 防呆：新增／修改一律先存草稿；線上頁不動。status=archived／draft 允許直接下架；要上線請用 publish_content（confirm=true）。
        const slug = String(p.slug ?? '').trim();
        if (!slug) throw new Error('slug is required');
        let existing = await this.prisma.content.findUnique({ where: { slug } });
        const type = String(p.type ?? existing?.type ?? 'page');
        let created = false;
        if (!existing) {
          existing = await this.prisma.content.create({ data: { source: 'admin', externalId: `admin:${slug}`, slug, type, title: p.title !== undefined ? String(p.title) : slug, status: 'draft', canonicalUrl: type === 'page' ? `/p/${slug}` : `/blog/${slug}`, ...(Array.isArray(p.tags) ? { tags: (p.tags as unknown[]).map(String) } : {}) } });
          created = true;
        } else if (Array.isArray(p.tags) || p.status === 'archived' || (p.status === 'draft' && existing.status === 'published')) {
          existing = await this.prisma.content.update({ where: { id: existing.id }, data: { ...(Array.isArray(p.tags) ? { tags: (p.tags as unknown[]).map(String) } : {}), ...(p.status === 'archived' || p.status === 'draft' ? { status: p.status } : {}) } });
        }
        const r = await this.design.saveDraft(existing.id, { ...(p.title !== undefined ? { title: String(p.title) } : {}), ...(p.body !== undefined ? { body: p.body ? String(p.body) : null } : {}), ...(p.design !== undefined ? { design: p.design } : {}), ...(p.excerpt !== undefined ? { excerpt: p.excerpt ? String(p.excerpt) : null } : {}), ...(p.coverUrl !== undefined ? { coverUrl: p.coverUrl ? String(p.coverUrl) : null } : {}) }, actor);
        return { id: existing.id, slug: existing.slug, type: existing.type, status: existing.status, liveVersion: r.content.version, created, savedAs: 'draft', dirty: r.dirty, lint: r.lint, preview: r.preview.url, next: p.status === 'published' ? '已改為只存草稿；請先用 preview_content 檢查，再 publish_content（confirm=true）上線' : '請用 preview_content 沙盒預覽，確認後 publish_content（confirm=true）' };
      }
      case 'get_content_draft':
        return this.design.getDraft(String(p.idOrSlug ?? p.slug ?? p.id ?? ''), actor);
      case 'preview_content': {
        const c = await this.design.content(String(p.idOrSlug ?? p.slug ?? p.id ?? ''));
        return { id: c.id, slug: c.slug, ...(await this.design.previewLink(c.id)) };
      }
      case 'publish_content':
        return this.design.publish(String(p.idOrSlug ?? p.slug ?? p.id ?? ''), { confirm: p.confirm === true || p.confirm === 'true', note: p.note ? String(p.note) : undefined }, actor);
      case 'list_revisions':
        return this.design.revisions(String(p.idOrSlug ?? p.slug ?? p.id ?? ''));
      case 'restore_revision':
        return this.design.restore(String(p.idOrSlug ?? p.slug ?? p.id ?? ''), Number(p.version), actor);
      case 'import_page_design':
        return this.design.importDesign(p as Record<string, unknown>, actor);
      case 'export_page_design':
        return this.design.exportDesign(String(p.idOrSlug ?? p.slug ?? p.id ?? ''));
      case 'create_admin':
        return this.admins.create(p);
      case 'list_admins':
        return this.admins.list();
      case 'update_admin': {
        const { idOrEmail, email, ...rest } = p;
        return this.admins.update(String(idOrEmail ?? email ?? ''), rest);
      }
      case 'delete_admin':
        return this.admins.remove(String(p.idOrEmail ?? p.email ?? ''));
      case 'send_test_notification':
        return this.notify.sendTest(p.to ? String(p.to) : undefined);
      case 'storage_status': {
        const [st, nc] = await Promise.all([this.storage.config(), this.notify.config()]);
        return { storage: { driver: st.driver, s3Ready: st.s3Ready, endpoint: st.endpoint, bucket: st.bucket, publicUrl: st.publicUrl, localDir: this.storage.localDir }, notify: { emailProvider: nc.emailProvider, resendConfigured: nc.resendConfigured, from: nc.from, adminTo: nc.adminTo, lineConfigured: nc.lineConfigured }, recent: this.notify.recent.slice(0, 20) };
      }
    }
  }
}

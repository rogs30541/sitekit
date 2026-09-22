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

import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { lintDesign, mapTree, normalizeSalesDoc, parseDesignDoc, renderDesignDocument, salesPageState, effectivePrice, type DesignDoc, type SalesPageDoc } from '@sitekit/shared';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { sanitizeHtml, slugify } from '../migration/normalize';

const createInput = z.object({ title: z.string().trim().min(1).max(200), slug: z.string().trim().max(120).optional(), code: z.string().trim().regex(/^[A-Z0-9]{0,3}$/).optional() });
const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * 一頁式銷售頁：草稿（doc）→ 沙盒預覽（token）→ confirm 發佈（備份版本、複製到 live）→ 前台讀 live。
 * 內文沿用頁面設計器文件（parseDesignDoc＋sanitize），追蹤碼的 HTML 只允許管理員自填、不消毒（1shop 同款「自訂程式碼」），但前台以獨立區塊注入。
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  list() {
    return this.prisma.salesPage.findMany({ orderBy: { updatedAt: 'desc' }, select: { id: true, slug: true, title: true, code: true, status: true, version: true, publishedAt: true, updatedAt: true, draft: true, live: true } }).then((rows) =>
      rows.map((r) => {
        const doc = normalizeSalesDoc(r.draft);
        return { id: r.id, slug: r.slug, title: r.title, code: r.code, status: r.status, version: r.version, publishedAt: r.publishedAt, updatedAt: r.updatedAt, items: doc.items.length, state: salesPageState({ status: r.status, doc: normalizeSalesDoc(r.live ?? r.draft) }), hasUnpublished: r.version === 0 || JSON.stringify(r.draft) !== JSON.stringify(r.live), url: `/s/${r.slug}` };
      }),
    );
  }

  async page(idOrSlug: string) {
    const p = await this.prisma.salesPage.findFirst({ where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] } });
    if (!p) throw new NotFoundException('sales page not found');
    return p;
  }

  async create(input: unknown, actor: string) {
    const d = createInput.parse(input);
    const slug = await this.uniqueSlug(d.slug || slugify(d.title, `sp${Date.now().toString(36)}`));
    const doc = normalizeSalesDoc({ seo: { title: d.title } });
    const p = await this.prisma.salesPage.create({ data: { slug, title: d.title, code: d.code || 'SP', status: 'draft', draft: doc as unknown as Prisma.InputJsonValue, updatedBy: actor } });
    return this.present(p);
  }

  /** 存草稿：patch 深度合併；內文設計文件驗證＋消毒；slug／title／code 可一併更新 */
  async saveDraft(idOrSlug: string, input: unknown, actor: string) {
    const p = await this.page(idOrSlug);
    const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const cur = normalizeSalesDoc(p.draft);
    const patch = (body.doc && typeof body.doc === 'object' ? body.doc : body) as Record<string, unknown>;
    let content: DesignDoc | null | undefined;
    if ('content' in patch) {
      if (patch.content === null) content = null;
      else {
        try {
          content = this.sanitizeDesign(parseDesignDoc(patch.content));
        } catch (e) {
          throw new BadRequestException(`內文設計文件無效：${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    const merged = normalizeSalesDoc({ ...cur, ...patch, content: content === undefined ? cur.content : content });
    // 產品清單只留存在的商品
    if (merged.items.length) {
      const ids = new Set((await this.prisma.product.findMany({ where: { id: { in: merged.items.map((i) => String(i.productId)) } }, select: { id: true } })).map((x) => x.id));
      merged.items = merged.items.filter((i) => ids.has(String(i.productId))).map((i, n) => ({ productId: String(i.productId), kind: ['offer', 'bundle', 'product', 'addon'].includes(String(i.kind)) ? i.kind : 'product', order: Number.isFinite(Number(i.order)) ? Number(i.order) : n, ...(i.badge ? { badge: String(i.badge).slice(0, 20) } : {}) }));
    }
    if (merged.access.password) merged.access.password = merged.access.password.startsWith('sha256:') ? merged.access.password : `sha256:${createHash('sha256').update(merged.access.password).digest('hex')}`;
    merged.notice.text = sanitizeHtml(String(merged.notice.text ?? '')).slice(0, 2000);
    merged.form.note.text = sanitizeHtml(String(merged.form.note.text ?? '')).slice(0, 5000);
    merged.success.note.text = sanitizeHtml(String(merged.success.note.text ?? '')).slice(0, 5000);
    const data: Prisma.SalesPageUpdateInput = { draft: merged as unknown as Prisma.InputJsonValue, updatedBy: actor };
    if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim().slice(0, 200);
    if (typeof body.code === 'string' && /^[A-Z0-9]{0,3}$/.test(body.code)) data.code = body.code || 'SP';
    if (typeof body.slug === 'string' && body.slug.trim()) {
      const slug = slugify(body.slug, p.slug) || p.slug;
      if (slug !== p.slug) {
        const hit = await this.prisma.salesPage.findUnique({ where: { slug } });
        if (hit && hit.id !== p.id) throw new BadRequestException(`網址「${slug}」已被使用`);
        data.slug = slug;
      }
    }
    const u = await this.prisma.salesPage.update({ where: { id: p.id }, data });
    return this.present(u);
  }

  private sanitizeDesign(doc: DesignDoc): DesignDoc {
    return { ...doc, root: mapTree(doc.root, (x) => (x.type === 'richtext' || x.type === 'html' ? { ...x, props: { ...x.props, html: sanitizeHtml(String(x.props.html ?? '')) } } : x)) };
  }

  async present(p: { id: string; slug: string; title: string; code: string; status: string; version: number; publishedAt: Date | null; updatedAt: Date; draft: Prisma.JsonValue; live: Prisma.JsonValue | null }) {
    const doc = normalizeSalesDoc(p.draft);
    const lint = this.lint(doc);
    const live = p.live ? normalizeSalesDoc(p.live) : null;
    const products = await this.resolveProducts(doc.items.map((i) => i.productId));
    return {
      page: { id: p.id, slug: p.slug, title: p.title, code: p.code, status: p.status, version: p.version, publishedAt: p.publishedAt, updatedAt: p.updatedAt, url: `/s/${p.slug}`, state: live ? salesPageState({ status: p.status, doc: live }) : 'draft' },
      doc: { ...doc, access: { ...doc.access, password: doc.access.password ? '••••••' : '' } },
      products,
      dirty: p.version === 0 || JSON.stringify(p.draft) !== JSON.stringify(p.live),
      lint,
      preview: await this.previewLink(p.id),
    };
  }

  /** 發佈前檢測 */
  lint(doc: SalesPageDoc) {
    const out: { level: 'error' | 'warn'; message: string }[] = [];
    const enabledKinds = doc.items.filter((i) => doc.sections.enabled[i.kind]);
    if (!doc.content && !enabledKinds.length) out.push({ level: 'error', message: '沒有內文也沒有啟用中的產品區塊，頁面會是空的' });
    if (doc.content) for (const l of lintDesign(doc.content)) out.push({ level: l.level, message: `內文：${l.message}` });
    if (doc.countdown.enabled && !(doc.countdown.endsAt && !Number.isNaN(new Date(doc.countdown.endsAt).getTime()))) out.push({ level: 'error', message: '優惠倒數已啟用但沒有有效的結束時間' });
    if (doc.notice.enabled && !doc.notice.text.trim()) out.push({ level: 'warn', message: '銷售頁通知已啟用但沒有文字' });
    if (doc.access.passwordEnabled && !doc.access.password) out.push({ level: 'error', message: '密碼保護已啟用但沒有設定密碼' });
    if (doc.schedule.openAt && doc.schedule.closeAt && new Date(doc.schedule.openAt) > new Date(doc.schedule.closeAt)) out.push({ level: 'error', message: '預約開啟時間晚於關閉時間' });
    if (!doc.seo.title.trim()) out.push({ level: 'warn', message: 'SEO 標題為空（將使用頁面標題）' });
    if (doc.tracking.head && /<script[^>]*src=["']http:/i.test(doc.tracking.head)) out.push({ level: 'warn', message: '追蹤碼含 http 非加密資源' });
    return out;
  }

  async resolveProducts(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, name: true, description: true, coverUrl: true, price: true, salePrice: true, saleStartsAt: true, saleEndsAt: true, stock: true, isActive: true, category: true, type: true, course: { select: { slug: true, isPublished: true } }, variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, price: true, stock: true } }, _count: { select: { items: true } } } });
    return rows.map((r) => ({ id: r.id, sku: r.sku, name: r.name, description: r.description, coverUrl: r.coverUrl, price: effectivePrice(r).price, originalPrice: r.price, onSale: effectivePrice(r).onSale, stock: r.stock, isActive: r.isActive, category: r.category, type: r.type, courseSlug: r.course?.slug ?? null, coursePublished: r.course?.isPublished ?? null, variants: r.variants, sold: r._count.items }));
  }

  /* ---------- 預覽 ---------- */
  private sign(id: string, exp: number) {
    return createHmac('sha256', env.SESSION_SECRET).update(`sales-preview:${id}:${exp}`).digest('base64url');
  }
  async previewLink(id: string) {
    const exp = Date.now() + PREVIEW_TTL_MS;
    const token = `${exp}.${this.sign(id, exp)}`;
    return { url: `${await this.settings.siteUrl()}/preview/sales/${id}?token=${encodeURIComponent(token)}`, token, expiresAt: new Date(exp) };
  }
  verifyPreview(id: string, token: string) {
    const [expS, sig] = String(token ?? '').split('.');
    const exp = Number(expS);
    if (!exp || !sig || exp < Date.now()) return false;
    const want = Buffer.from(this.sign(id, exp));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
  }
  async previewPublic(id: string, token: string) {
    if (!this.verifyPreview(id, token)) throw new UnauthorizedException('預覽連結無效或已過期');
    const p = await this.page(id);
    return this.render(p, normalizeSalesDoc(p.draft), true);
  }

  /** 前台：line 快照；排程／關閉／密碼 */
  async publicPage(slug: string, pw?: string) {
    const p = await this.prisma.salesPage.findUnique({ where: { slug } });
    if (!p || p.status !== 'published' || !p.live) throw new NotFoundException('sales page not found');
    const doc = normalizeSalesDoc(p.live);
    const state = salesPageState({ status: p.status, doc });
    if (state !== 'open') return { id: p.id, slug: p.slug, title: p.title, state, closedMessage: doc.schedule.closedMessage, openAt: doc.schedule.openAt || null, seo: doc.seo };
    if (doc.access.passwordEnabled) {
      const okPw = !!pw && doc.access.password === `sha256:${createHash('sha256').update(pw).digest('hex')}`;
      if (!okPw) return { id: p.id, slug: p.slug, title: p.title, state: 'locked' as const, seo: { ...doc.seo, description: '' } };
    }
    return this.render(p, doc, false);
  }

  private async render(p: { id: string; slug: string; title: string; code: string; status: string; version: number; updatedAt: Date }, doc: SalesPageDoc, isPreview: boolean) {
    const products = await this.resolveProducts(doc.items.map((i) => i.productId));
    const byId = new Map(products.map((x) => [x.id, x]));
    const items = [...doc.items].sort((a, b) => a.order - b.order).map((i) => ({ ...i, product: byId.get(i.productId) ?? null })).filter((i) => i.product && (isPreview || i.product.isActive));
    const { access: _a, tracking, ...rest } = doc;
    return { id: p.id, slug: p.slug, title: p.title, code: p.code, state: isPreview ? ('preview' as const) : ('open' as const), version: p.version, updatedAt: p.updatedAt, doc: { ...rest, tracking }, items, contentHtml: doc.content ? renderDesignDocument(doc.content) : null };
  }

  /* ---------- 發佈 ---------- */
  async publish(idOrSlug: string, opts: { confirm?: boolean; note?: string }, actor: string) {
    if (opts.confirm !== true) throw new BadRequestException('發佈需要 confirm=true（請先在沙盒預覽確認）');
    const p = await this.page(idOrSlug);
    const doc = normalizeSalesDoc(p.draft);
    const errors = this.lint(doc).filter((l) => l.level === 'error');
    if (errors.length) throw new BadRequestException(`發佈前檢測未通過：${errors.map((e) => e.message).join('；')}`);
    const hadLive = !!p.live;
    const r = await this.prisma.$transaction(async (tx) => {
      if (hadLive) await tx.salesPageRevision.upsert({ where: { pageId_version: { pageId: p.id, version: p.version } }, create: { pageId: p.id, version: p.version, title: p.title, slug: p.slug, snapshot: p.live as Prisma.InputJsonValue, note: opts.note?.slice(0, 200) ?? null, createdBy: actor }, update: { snapshot: p.live as Prisma.InputJsonValue, createdBy: actor } });
      const version = p.version + 1;
      const u = await tx.salesPage.update({ where: { id: p.id }, data: { live: p.draft as Prisma.InputJsonValue, status: 'published', version, publishedAt: p.publishedAt ?? new Date() } });
      const old = await tx.salesPageRevision.findMany({ where: { pageId: p.id }, orderBy: { version: 'desc' }, skip: 30, select: { id: true } });
      if (old.length) await tx.salesPageRevision.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      return { version, backedUpVersion: hadLive ? p.version : null, slug: u.slug };
    });
    return { id: p.id, ...r, url: `/s/${r.slug}`, warnings: this.lint(doc).filter((l) => l.level === 'warn') };
  }
  async unpublish(idOrSlug: string) {
    const p = await this.page(idOrSlug);
    await this.prisma.salesPage.update({ where: { id: p.id }, data: { status: 'draft' } });
    return { id: p.id, status: 'draft' };
  }
  async revisions(idOrSlug: string) {
    const p = await this.page(idOrSlug);
    const rows = await this.prisma.salesPageRevision.findMany({ where: { pageId: p.id }, orderBy: { version: 'desc' }, select: { version: true, title: true, slug: true, note: true, createdBy: true, createdAt: true } });
    return { current: { version: p.version, status: p.status, publishedAt: p.publishedAt }, revisions: rows };
  }
  async restore(idOrSlug: string, version: number, actor: string) {
    const p = await this.page(idOrSlug);
    const r = await this.prisma.salesPageRevision.findUnique({ where: { pageId_version: { pageId: p.id, version } } });
    if (!r) throw new NotFoundException(`找不到版本 ${version}`);
    const u = await this.prisma.salesPage.update({ where: { id: p.id }, data: { draft: r.snapshot as Prisma.InputJsonValue, updatedBy: actor } });
    return { restoredVersion: version, ...(await this.present(u)) };
  }
  async remove(idOrSlug: string) {
    const p = await this.page(idOrSlug);
    await this.prisma.salesPage.delete({ where: { id: p.id } });
    return { deleted: p.slug };
  }

  private async uniqueSlug(base: string) {
    const s = slugify(base, base) || `sp${Date.now().toString(36)}`;
    let slug = s;
    for (let i = 2; i < 100; i++) {
      if (!(await this.prisma.salesPage.findUnique({ where: { slug } }))) return slug;
      slug = `${s}-${i}`;
    }
    throw new BadRequestException('cannot allocate slug');
  }
}

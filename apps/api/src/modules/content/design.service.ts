import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { lintDesign, mapTree, parseDesignDoc, renderDesignDocument, type DesignDoc, type LintIssue } from '@sitekit/shared';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { RevalidateService } from '../settings/revalidate.service';
import { sanitizeHtml, slugify } from '../migration/normalize';

const draftInput = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().max(120).optional(),
  excerpt: z.string().max(1000).nullable().optional(),
  coverUrl: z.string().max(1000).nullable().optional(),
  body: z.string().max(500_000).nullable().optional(),
  /** 設計文件 JSON；傳 null＝改回傳統 HTML body */
  design: z.unknown().optional(),
});
export type DraftInput = z.infer<typeof draftInput>;

const PREVIEW_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * 頁面草稿／沙盒預覽／發佈確認／版本備份（防呆機制）：
 * - 新增或修改一律寫 ContentDraft，線上 Content 不動。
 * - 沙盒預覽用 HMAC token 讀草稿（不需登入，可交給測試者），2 小時有效。
 * - 發佈必須 confirm=true；發佈前跑 lintDesign（error 阻擋）並把目前線上版本備份成 ContentRevision，才覆蓋線上。
 * - 還原版本只回到草稿，再走一次預覽／發佈確認。
 */
@Injectable()
export class DesignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly reval: RevalidateService,
  ) {}

  async content(idOrSlug: string) {
    const c = await this.prisma.content.findFirst({ where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] }, include: { draft: true } });
    if (!c) throw new NotFoundException('content not found');
    return c;
  }

  private sanitizeDesign(doc: DesignDoc): DesignDoc {
    return { ...doc, root: mapTree(doc.root, (x) => (x.type === 'richtext' || x.type === 'html' ? { ...x, props: { ...x.props, html: sanitizeHtml(String(x.props.html ?? '')) } } : x)) };
  }

  private designOf(v: Prisma.JsonValue | null | undefined): DesignDoc | null {
    if (!v || typeof v !== 'object') return null;
    try {
      return parseDesignDoc(v);
    } catch {
      return null;
    }
  }

  /** 讀草稿；沒有草稿就從線上版複製一份（首次進編輯器） */
  async getDraft(idOrSlug: string, actor?: string) {
    const c = await this.content(idOrSlug);
    const draft = c.draft ?? (await this.prisma.contentDraft.create({ data: { contentId: c.id, title: c.title, slug: c.slug, excerpt: c.excerpt, coverUrl: c.coverUrl, body: c.body, design: c.design ?? Prisma.JsonNull, updatedBy: actor ?? null } }));
    return this.present(c, draft);
  }

  private async present(c: Awaited<ReturnType<DesignService['content']>>, draft: NonNullable<Awaited<ReturnType<DesignService['content']>>['draft']>) {
    const design = this.designOf(draft.design);
    const lint = design ? lintDesign(design) : draft.body?.trim() ? [] : [{ level: 'error', nodeId: 'root', type: 'root', message: '內容為空' } as LintIssue];
    const dirty = c.version === 0 || draft.updatedAt.getTime() > c.updatedAt.getTime() || draft.title !== c.title || draft.slug !== c.slug || JSON.stringify(draft.design) !== JSON.stringify(c.design) || (draft.body ?? '') !== (c.body ?? '');
    return {
      content: { id: c.id, type: c.type, title: c.title, slug: c.slug, status: c.status, version: c.version, hasDesign: !!c.design, publishedAt: c.publishedAt, updatedAt: c.updatedAt, url: c.type === 'page' ? (c.slug === 'home' ? '/' : `/p/${c.slug}`) : `/blog/${c.slug}` },
      draft: { title: draft.title, slug: draft.slug, excerpt: draft.excerpt, coverUrl: draft.coverUrl, body: draft.body, design, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy },
      dirty,
      lint,
      preview: await this.previewLink(c.id),
    };
  }

  /** 存草稿（線上不動） */
  async saveDraft(idOrSlug: string, input: unknown, actor: string) {
    const c = await this.content(idOrSlug);
    const d = draftInput.parse(input);
    let design: DesignDoc | null | undefined;
    if (d.design === null) design = null;
    else if (d.design !== undefined) {
      try {
        design = this.sanitizeDesign(parseDesignDoc(d.design));
      } catch (e) {
        throw new BadRequestException(`設計文件無效：${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const slug = d.slug !== undefined ? slugify(d.slug, c.slug) || c.slug : undefined;
    if (slug && slug !== c.slug) {
      const hit = await this.prisma.content.findUnique({ where: { slug } });
      if (hit && hit.id !== c.id) throw new BadRequestException(`slug「${slug}」已被其他內容使用`);
    }
    const data = {
      ...(d.title !== undefined ? { title: d.title } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(d.excerpt !== undefined ? { excerpt: d.excerpt } : {}),
      ...(d.coverUrl !== undefined ? { coverUrl: d.coverUrl || null } : {}),
      ...(d.body !== undefined ? { body: d.body ? sanitizeHtml(d.body) : null } : {}),
      ...(design !== undefined ? { design: design === null ? Prisma.JsonNull : (design as unknown as Prisma.InputJsonValue) } : {}),
      updatedBy: actor,
    };
    const draft = await this.prisma.contentDraft.upsert({
      where: { contentId: c.id },
      create: { contentId: c.id, title: c.title, slug: c.slug, excerpt: c.excerpt, coverUrl: c.coverUrl, body: c.body, design: c.design ?? Prisma.JsonNull, ...data },
      update: data,
    });
    return this.present(c, draft);
  }

  /* ---------- 沙盒預覽 ---------- */
  private sign(id: string, exp: number) {
    return createHmac('sha256', env.SESSION_SECRET).update(`preview:${id}:${exp}`).digest('base64url');
  }
  async previewLink(id: string) {
    const exp = Date.now() + PREVIEW_TTL_MS;
    const token = `${exp}.${this.sign(id, exp)}`;
    const site = await this.settings.siteUrl();
    return { url: `${site}/preview/${id}?token=${encodeURIComponent(token)}`, token, expiresAt: new Date(exp) };
  }
  verifyPreview(id: string, token: string) {
    const [expS, sig] = String(token ?? '').split('.');
    const exp = Number(expS);
    if (!exp || !sig || exp < Date.now()) return false;
    const want = Buffer.from(this.sign(id, exp));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
  }
  /** 公開（token 驗章）：回草稿渲染結果 */
  async previewPublic(id: string, token: string) {
    if (!this.verifyPreview(id, token)) throw new UnauthorizedException('預覽連結無效或已過期');
    const c = await this.content(id);
    const draft = c.draft;
    if (!draft) throw new NotFoundException('尚無草稿');
    const design = this.designOf(draft.design);
    return { id: c.id, type: c.type, title: draft.title, slug: draft.slug, excerpt: draft.excerpt, coverUrl: draft.coverUrl, hasDesign: !!design, body: design ? renderDesignDocument(design) : (draft.body ?? ''), updatedAt: draft.updatedAt, liveVersion: c.version, liveStatus: c.status };
  }

  /* ---------- 發佈（需確認＋備份） ---------- */
  async publish(idOrSlug: string, opts: { confirm?: boolean; note?: string }, actor: string) {
    if (opts.confirm !== true) throw new BadRequestException('發佈需要 confirm=true（請先在沙盒預覽確認）');
    const c = await this.content(idOrSlug);
    const draft = c.draft;
    if (!draft) throw new BadRequestException('尚無草稿可發佈，請先儲存草稿');
    const design = this.designOf(draft.design);
    const lint = design ? lintDesign(design) : [];
    const errors = lint.filter((l) => l.level === 'error');
    if (errors.length) throw new BadRequestException(`發佈前檢測未通過：${errors.map((e) => `[${e.type}] ${e.message}`).join('；')}`);
    if (!design && !draft.body?.trim()) throw new BadRequestException('內容為空，不能發佈');
    const hit = await this.prisma.content.findUnique({ where: { slug: draft.slug } });
    if (hit && hit.id !== c.id) throw new BadRequestException(`slug「${draft.slug}」已被其他內容使用`);
    const body = design ? renderDesignDocument(design) : sanitizeHtml(draft.body ?? '');
    const hadLive = c.status === 'published' || c.version > 0 || !!c.body;
    const result = await this.prisma.$transaction(async (tx) => {
      let backedUp: number | null = null;
      if (hadLive) {
        backedUp = c.version;
        await tx.contentRevision.upsert({
          where: { contentId_version: { contentId: c.id, version: c.version } },
          create: { contentId: c.id, version: c.version, title: c.title, slug: c.slug, excerpt: c.excerpt, coverUrl: c.coverUrl, body: c.body, design: c.design ?? Prisma.JsonNull, status: c.status, note: opts.note?.slice(0, 200) ?? null, createdBy: actor },
          update: { title: c.title, slug: c.slug, excerpt: c.excerpt, coverUrl: c.coverUrl, body: c.body, design: c.design ?? Prisma.JsonNull, status: c.status, createdBy: actor },
        });
      }
      const version = c.version + 1;
      const updated = await tx.content.update({
        where: { id: c.id },
        data: { title: draft.title, slug: draft.slug, excerpt: draft.excerpt, coverUrl: draft.coverUrl, body, design: design ? (design as unknown as Prisma.InputJsonValue) : Prisma.JsonNull, status: 'published', version, publishedAt: c.publishedAt ?? new Date(), canonicalUrl: c.type === 'page' ? `/p/${draft.slug}` : `/blog/${draft.slug}` },
      });
      // 只保留最近 30 個版本
      const old = await tx.contentRevision.findMany({ where: { contentId: c.id }, orderBy: { version: 'desc' }, skip: 30, select: { id: true } });
      if (old.length) await tx.contentRevision.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
      return { version, backedUpVersion: backedUp, updated };
    });
    this.reval.trigger('content');
    return { id: c.id, slug: result.updated.slug, version: result.version, backedUpVersion: result.backedUpVersion, url: c.type === 'page' ? (result.updated.slug === 'home' ? '/' : `/p/${result.updated.slug}`) : `/blog/${result.updated.slug}`, warnings: lint.filter((l) => l.level === 'warn') };
  }

  /* ---------- 版本 ---------- */
  async revisions(idOrSlug: string) {
    const c = await this.content(idOrSlug);
    const rows = await this.prisma.contentRevision.findMany({ where: { contentId: c.id }, orderBy: { version: 'desc' }, select: { version: true, title: true, slug: true, status: true, note: true, createdBy: true, createdAt: true, design: true } });
    return { current: { version: c.version, title: c.title, slug: c.slug, status: c.status, publishedAt: c.publishedAt, updatedAt: c.updatedAt, hasDesign: !!c.design }, revisions: rows.map((r) => ({ ...r, hasDesign: !!r.design, design: undefined })) };
  }
  /** 還原到草稿（不直接改線上） */
  async restore(idOrSlug: string, version: number, actor: string) {
    const c = await this.content(idOrSlug);
    const r = await this.prisma.contentRevision.findUnique({ where: { contentId_version: { contentId: c.id, version } } });
    if (!r) throw new NotFoundException(`找不到版本 ${version}`);
    const draft = await this.prisma.contentDraft.upsert({
      where: { contentId: c.id },
      create: { contentId: c.id, title: r.title, slug: r.slug, excerpt: r.excerpt, coverUrl: r.coverUrl, body: r.body, design: r.design ?? Prisma.JsonNull, updatedBy: actor },
      update: { title: r.title, slug: r.slug, excerpt: r.excerpt, coverUrl: r.coverUrl, body: r.body, design: r.design ?? Prisma.JsonNull, updatedBy: actor },
    });
    return { restoredVersion: version, ...(await this.present(c, draft)) };
  }

  /* ---------- JSON 匯入／匯出 ---------- */
  async importDesign(input: { slug?: unknown; title?: unknown; type?: unknown; design?: unknown; excerpt?: unknown; coverUrl?: unknown }, actor: string) {
    let design: DesignDoc;
    try {
      design = parseDesignDoc(input.design ?? input);
    } catch (e) {
      throw new BadRequestException(`設計文件無效：${e instanceof Error ? e.message : String(e)}`);
    }
    const title = String(input.title ?? '').trim() || '匯入的頁面';
    const type = input.type === 'post' ? 'post' : 'page';
    const wantSlug = String(input.slug ?? '').trim();
    let content = wantSlug ? await this.prisma.content.findUnique({ where: { slug: wantSlug }, include: { draft: true } }) : null;
    let created = false;
    if (!content) {
      const slug = await this.uniqueSlug(wantSlug || slugify(title, `p${Date.now().toString(36)}`));
      content = await this.prisma.content.create({ data: { source: 'admin', externalId: `admin:${slug}`, type, title, slug, status: 'draft', canonicalUrl: type === 'page' ? `/p/${slug}` : `/blog/${slug}` }, include: { draft: true } });
      created = true;
    }
    const r = await this.saveDraft(content.id, { title, design, ...(input.excerpt !== undefined ? { excerpt: String(input.excerpt) } : {}), ...(input.coverUrl !== undefined ? { coverUrl: String(input.coverUrl) } : {}) }, actor);
    return { id: content.id, slug: content.slug, created, lint: r.lint, preview: r.preview };
  }
  async exportDesign(idOrSlug: string) {
    const c = await this.content(idOrSlug);
    const src = c.draft ?? c;
    const design = this.designOf(src.design);
    return { id: c.id, type: c.type, title: src.title, slug: src.slug, excerpt: src.excerpt, coverUrl: src.coverUrl, source: c.draft ? 'draft' : 'live', design, ...(design ? {} : { body: src.body }) };
  }

  private async uniqueSlug(base: string) {
    const s = slugify(base, base) || `p${Date.now().toString(36)}`;
    let slug = s;
    for (let i = 2; i < 100; i++) {
      if (!(await this.prisma.content.findUnique({ where: { slug } }))) return slug;
      slug = `${s}-${i}`;
    }
    throw new BadRequestException('cannot allocate slug');
  }
}

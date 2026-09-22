import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard } from '../../common/guards';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizeHtml, slugify } from '../migration/normalize';
import { extFromMime, StorageService } from '../storage/storage.service';

const contentInput = z.object({
  type: z.enum(['post', 'page']).default('post'),
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(120).optional(),
  body: z.string().max(500_000).nullable().optional(),
  excerpt: z.string().max(1000).nullable().optional(),
  coverUrl: z.string().max(1000).nullable().optional(),
  author: z.string().max(80).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  publishedAt: z.string().datetime().nullable().optional(),
});
/** 後台圖片上傳上限（Logo／封面／編輯器圖片）；前端 lib/upload-image.ts 同值先擋 */
export const UPLOAD_MAX_BYTES = 1024 * 1024;
const uploadInput = z.object({ filename: z.string().max(200).optional(), contentType: z.string().regex(/^image\//), dataBase64: z.string().min(1) });

/** 後台內容編輯器 API：官網頁面（type=page）與文章（type=post）的 CRUD；source=admin。 */
@Controller('admin/content')
@UseGuards(AdminSessionGuard)
export class AdminContentController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  list(@Query('type') type?: string, @Query('status') status?: string) {
    return this.prisma.content.findMany({
      where: { ...(type ? { type } : {}), ...(status ? { status: status as 'draft' | 'published' | 'archived' } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 300,
      select: { id: true, type: true, title: true, slug: true, status: true, source: true, publishedAt: true, updatedAt: true, excerpt: true, coverUrl: true, tags: true, version: true, design: true, draft: { select: { updatedAt: true, updatedBy: true } } },
    }).then((rows) => rows.map(({ design, draft, ...r }) => ({ ...r, hasDesign: !!design, draftUpdatedAt: draft?.updatedAt ?? null, draftUpdatedBy: draft?.updatedBy ?? null, hasUnpublished: !!draft && (r.version === 0 || draft.updatedAt.getTime() > r.updatedAt.getTime()) })));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const c = await this.prisma.content.findFirst({ where: { OR: [{ id }, { slug: id }] } });
    if (!c) throw new NotFoundException('content not found');
    return c;
  }

  @Post()
  async create(@Body() body: unknown) {
    const d = contentInput.parse(body);
    const slug = await this.uniqueSlug(d.slug || slugify(d.title, `c${Date.now().toString(36)}`));
    const status = d.status ?? 'draft';
    return this.prisma.content.create({
      data: { source: 'admin', externalId: `admin:${slug}`, type: d.type, title: d.title, slug, body: d.body ? sanitizeHtml(d.body) : null, excerpt: d.excerpt ?? null, coverUrl: d.coverUrl || null, author: d.author ?? null, tags: d.tags ?? [], status, canonicalUrl: d.type === 'page' ? `/p/${slug}` : `/blog/${slug}`, publishedAt: d.publishedAt ? new Date(d.publishedAt) : status === 'published' ? new Date() : null },
    });
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const c = await this.get(id);
    const d = contentInput.partial().parse(body);
    const slug = d.slug && d.slug !== c.slug ? await this.uniqueSlug(d.slug, c.id) : undefined;
    const type = d.type ?? c.type;
    const status = d.status ?? c.status;
    return this.prisma.content.update({
      where: { id: c.id },
      data: {
        type: d.type,
        title: d.title,
        ...(slug ? { slug, canonicalUrl: type === 'page' ? `/p/${slug}` : `/blog/${slug}` } : {}),
        ...(d.body !== undefined ? { body: d.body ? sanitizeHtml(d.body) : null } : {}),
        excerpt: d.excerpt,
        ...(d.coverUrl !== undefined ? { coverUrl: d.coverUrl || null } : {}),
        author: d.author,
        tags: d.tags,
        status: d.status,
        ...(d.publishedAt !== undefined ? { publishedAt: d.publishedAt ? new Date(d.publishedAt) : null } : status === 'published' && !c.publishedAt ? { publishedAt: new Date() } : {}),
      },
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const c = await this.get(id);
    await this.prisma.content.delete({ where: { id: c.id } });
    return { deleted: c.slug };
  }

  /** 編輯器圖片上傳（JSON base64，≤1MB；使用者 2026-09-23 指定）：存到 StorageService（local／R2），回公開網址。 */
  @Post('upload')
  async upload(@Body() body: unknown) {
    const d = uploadInput.parse(body);
    const bytes = Buffer.from(d.dataBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (!bytes.length || bytes.length > UPLOAD_MAX_BYTES) throw new BadRequestException(`圖片需 1MB 以內（目前 ${(bytes.length / 1024 / 1024).toFixed(2)} MB）`);
    const key = `uploads/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${extFromMime(d.contentType)}`;
    return this.storage.put(key, bytes, d.contentType);
  }

  private async uniqueSlug(base: string, excludeId?: string) {
    const s = slugify(base, base) || `c${Date.now().toString(36)}`;
    let slug = s;
    for (let i = 2; i < 100; i++) {
      const hit = await this.prisma.content.findUnique({ where: { slug } });
      if (!hit || hit.id === excludeId) return slug;
      slug = `${s}-${i}`;
    }
    throw new BadRequestException('cannot allocate slug');
  }
}

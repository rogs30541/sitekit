import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';

const productInput = z.object({
  type: z.enum(['physical', 'course', 'credit_pack']),
  sku: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  coverUrl: z.string().url().nullable().optional().or(z.literal('').transform(() => null)),
  price: z.number().int().min(0),
  isActive: z.boolean().optional(),
});
const videoRef = z.object({ provider: z.enum(['youtube', 'bunny']), id: z.string().trim().max(120) }).nullable().optional();
const courseInput = z.object({
  product: productInput.omit({ type: true }),
  slug: z.string().trim().min(1).max(120),
  summary: z.string().max(5000).nullable().optional(),
  isPublished: z.boolean().optional(),
  coverVideo: videoRef,
  previewVideo: videoRef,
  accessMode: z.enum(['unlimited', 'days', 'until']).optional(),
  accessDays: z.number().int().min(1).max(3650).nullable().optional(),
  accessUntil: z.string().datetime().nullable().optional(),
});
const chapterInput = z.object({
  parentId: z.string().nullable().optional(),
  order: z.number().int().min(0),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20000).nullable().optional(),
  videoProvider: z.enum(['bunny', 'youtube']).optional(),
  videoProviderId: z.string().trim().max(120).nullable().optional(),
  durationSec: z.number().int().min(0).nullable().optional(),
  isPreview: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});
const reorderInput = z.object({ items: z.array(z.object({ id: z.string(), parentId: z.string().nullable(), order: z.number().int().min(0) })).max(500) });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new BadRequestException(r.error.flatten().fieldErrors);
  return r.data;
}

const PUBLIC_CHAPTER = { id: true, parentId: true, order: true, title: true, durationSec: true, isPreview: true, videoProviderId: true } as const;

/** 目錄：商品與課程共用 Product；公開讀取只回上架／已發布，且永不回傳章節影片 ID。 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- 公開 ----
  listProducts(type?: string) {
    return this.prisma.product.findMany({
      where: { isActive: true, ...(type ? { type: type as 'physical' | 'course' | 'credit_pack' } : {}) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, sku: true, name: true, description: true, coverUrl: true, price: true, course: { select: { slug: true } } },
    });
  }

  listCourses() {
    return this.prisma.course.findMany({
      where: { isPublished: true, product: { isActive: true } },
      orderBy: { product: { createdAt: 'desc' } },
      select: { id: true, slug: true, summary: true, product: { select: { id: true, name: true, description: true, coverUrl: true, price: true } }, _count: { select: { chapters: { where: { isPublished: true } } } } },
    });
  }

  async getCourse(slug: string) {
    const c = await this.prisma.course.findFirst({
      where: { slug, isPublished: true },
      include: {
        product: { select: { id: true, name: true, description: true, coverUrl: true, price: true, isActive: true } },
        chapters: { where: { isPublished: true }, orderBy: [{ order: 'asc' }], select: PUBLIC_CHAPTER },
      },
    });
    if (!c) throw new NotFoundException('course not found');
    const { coverVideoProvider, coverVideoId, previewVideoProvider, previewVideoId, ...rest } = c;
    return {
      ...rest,
      coverVideo: coverVideoId ? { provider: coverVideoProvider ?? 'youtube', id: coverVideoId } : null,
      previewVideo: previewVideoId ? { provider: previewVideoProvider ?? 'youtube', id: previewVideoId } : null,
      // 只告訴前端「有沒有影片」，不透露來源與 ID
      chapters: c.chapters.map(({ videoProviderId, ...ch }) => ({ ...ch, hasVideo: !!videoProviderId })),
    };
  }

  // ---- 後台 ----
  listAllCourses() {
    return this.prisma.course.findMany({ orderBy: { product: { createdAt: 'desc' } }, include: { product: true, _count: { select: { chapters: true } } } });
  }

  async getCourseAdmin(id: string) {
    const c = await this.prisma.course.findUnique({ where: { id }, include: { product: true, chapters: { orderBy: [{ order: 'asc' }] } } });
    if (!c) throw new NotFoundException('course not found');
    return c;
  }

  createProduct(input: unknown) {
    return this.prisma.product.create({ data: parse(productInput, input) });
  }

  updateProduct(id: string, input: unknown) {
    return this.prisma.product.update({ where: { id }, data: parse(productInput.partial(), input) });
  }

  private courseData(d: z.infer<typeof courseInput> | Partial<z.infer<typeof courseInput>>) {
    return {
      slug: d.slug,
      summary: d.summary,
      isPublished: d.isPublished,
      ...(d.coverVideo !== undefined ? { coverVideoProvider: d.coverVideo?.provider ?? null, coverVideoId: d.coverVideo?.id || null } : {}),
      ...(d.previewVideo !== undefined ? { previewVideoProvider: d.previewVideo?.provider ?? null, previewVideoId: d.previewVideo?.id || null } : {}),
      accessMode: d.accessMode,
      accessDays: d.accessDays,
      ...(d.accessUntil !== undefined ? { accessUntil: d.accessUntil ? new Date(d.accessUntil) : null } : {}),
    };
  }

  createCourse(input: unknown) {
    const d = parse(courseInput, input);
    return this.prisma.course.create({
      data: { ...this.courseData(d), slug: d.slug, product: { create: { ...d.product, type: 'course' } } },
      include: { product: true },
    });
  }

  updateCourse(id: string, input: unknown) {
    const d = parse(courseInput.partial(), input);
    return this.prisma.course.update({
      where: { id },
      data: { ...this.courseData(d), ...(d.product ? { product: { update: d.product } } : {}) },
      include: { product: true },
    });
  }

  async addChapter(courseId: string, input: unknown) {
    const d = parse(chapterInput.partial({ order: true }), input);
    const last = await this.prisma.chapter.findFirst({ where: { courseId, parentId: d.parentId ?? null }, orderBy: { order: 'desc' } });
    return this.prisma.chapter.create({ data: { courseId, ...d, title: d.title ?? '未命名章節', order: d.order ?? (last?.order ?? -1) + 1 } });
  }

  updateChapter(id: string, input: unknown) {
    return this.prisma.chapter.update({ where: { id }, data: parse(chapterInput.partial(), input) });
  }

  deleteChapter(id: string) {
    return this.prisma.chapter.delete({ where: { id } });
  }

  /** 整棵樹一次重排（拖曳／升降階後前端送完整 items）。 */
  async reorderChapters(courseId: string, input: unknown) {
    const { items } = parse(reorderInput, input);
    const ids = new Set(items.map((i) => i.id));
    for (const i of items) if (i.parentId && !ids.has(i.parentId)) throw new BadRequestException(`unknown parent ${i.parentId}`);
    await this.prisma.$transaction(items.map((i) => this.prisma.chapter.update({ where: { id: i.id, courseId }, data: { parentId: i.parentId, order: i.order } })));
    return this.getCourseAdmin(courseId);
  }
}

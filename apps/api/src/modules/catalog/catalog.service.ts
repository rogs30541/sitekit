import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';

const productInput = z.object({
  type: z.enum(['physical', 'course', 'credit_pack']),
  sku: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  coverUrl: z.string().url().nullable().optional(),
  price: z.number().int().min(0),
  isActive: z.boolean().optional(),
});
const courseInput = z.object({
  product: productInput.omit({ type: true }),
  slug: z.string().trim().min(1).max(120),
  summary: z.string().max(5000).nullable().optional(),
  isPublished: z.boolean().optional(),
});
const chapterInput = z.object({
  order: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
  videoProviderId: z.string().trim().max(120).nullable().optional(),
  durationSec: z.number().int().min(0).nullable().optional(),
  isPreview: z.boolean().optional(),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new BadRequestException(r.error.flatten().fieldErrors);
  return r.data;
}

/** 目錄：商品與課程共用 Product；公開讀取只回上架／已發布。 */
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
      select: { id: true, slug: true, summary: true, product: { select: { id: true, name: true, description: true, coverUrl: true, price: true } }, _count: { select: { chapters: true } } },
    });
  }

  async getCourse(slug: string, includeVideoIds = false) {
    const c = await this.prisma.course.findFirst({
      where: { slug, isPublished: true },
      include: {
        product: { select: { id: true, name: true, description: true, coverUrl: true, price: true, isActive: true } },
        chapters: { orderBy: { order: 'asc' }, select: { id: true, order: true, title: true, durationSec: true, isPreview: true, videoProviderId: includeVideoIds } },
      },
    });
    if (!c) throw new NotFoundException('course not found');
    return c;
  }

  // ---- 後台 ----
  createProduct(input: unknown) {
    return this.prisma.product.create({ data: parse(productInput, input) });
  }

  updateProduct(id: string, input: unknown) {
    return this.prisma.product.update({ where: { id }, data: parse(productInput.partial(), input) });
  }

  createCourse(input: unknown) {
    const d = parse(courseInput, input);
    return this.prisma.course.create({
      data: { slug: d.slug, summary: d.summary ?? null, isPublished: d.isPublished ?? false, product: { create: { ...d.product, type: 'course' } } },
      include: { product: true },
    });
  }

  updateCourse(id: string, input: unknown) {
    const d = parse(courseInput.partial(), input);
    return this.prisma.course.update({
      where: { id },
      data: { slug: d.slug, summary: d.summary, isPublished: d.isPublished, ...(d.product ? { product: { update: d.product } } : {}) },
      include: { product: true },
    });
  }

  addChapter(courseId: string, input: unknown) {
    return this.prisma.chapter.create({ data: { courseId, ...parse(chapterInput, input) } });
  }

  updateChapter(id: string, input: unknown) {
    return this.prisma.chapter.update({ where: { id }, data: parse(chapterInput.partial(), input) });
  }

  deleteChapter(id: string) {
    return this.prisma.chapter.delete({ where: { id } });
  }

  listAllCourses() {
    return this.prisma.course.findMany({ orderBy: { product: { createdAt: 'desc' } }, include: { product: true, _count: { select: { chapters: true } } } });
  }
}

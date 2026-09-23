import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { RevalidateService } from '../settings/revalidate.service';

const productInput = z.object({
  type: z.enum(['physical', 'course', 'credit_pack']),
  sku: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  coverUrl: z.string().url().nullable().optional().or(z.literal('').transform(() => null)),
  price: z.number().int().min(0),
  isActive: z.boolean().optional(),
  stock: z.number().int().min(0).nullable().optional(),
  sortOrder: z.number().int().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  salePrice: z.number().int().min(0).nullable().optional(),
  saleStartsAt: z.string().datetime().nullable().optional(),
  saleEndsAt: z.string().datetime().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  hidden: z.boolean().optional(),
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
  publishedAt: z.string().datetime().nullable().optional(),
  instructorName: z.string().max(80).nullable().optional(),
  instructorBio: z.string().max(2000).nullable().optional(),
  purchaseNote: z.string().max(2000).nullable().optional(),
  buttonText: z.string().max(50).nullable().optional(),
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
const variantsInput = z.object({
  specs: z.array(z.object({ name: z.string().trim().min(1).max(30), values: z.array(z.string().trim().min(1).max(40)).min(1).max(30) })).max(3).default([]),
  variants: z
    .array(z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(120), sku: z.string().trim().min(1).max(60), price: z.number().int().min(0).nullable().optional(), stock: z.number().int().min(0).nullable().optional(), isActive: z.boolean().default(true), sortOrder: z.number().int().default(0), options: z.record(z.string()).default({}) }))
    .max(200)
    .default([]),
});
const PUBLIC_VARIANT = { id: true, name: true, sku: true, price: true, stock: true, options: true, sortOrder: true } as const;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly reval: RevalidateService,
  ) {}

  // ---- 公開 ----
  listProducts(type?: string, category?: string) {
    return this.prisma.product.findMany({
      where: { isActive: true, hidden: false, ...(type ? { type: type as 'physical' | 'course' | 'credit_pack' } : {}), ...(category ? { category } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, type: true, sku: true, name: true, description: true, coverUrl: true, price: true, salePrice: true, saleStartsAt: true, saleEndsAt: true, tags: true, stock: true, category: true, specs: true, course: { select: { slug: true } }, variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: PUBLIC_VARIANT } },
    });
  }

  /** 後台商品清單（含下架、庫存、銷量） */
  listProductsAdmin() {
    return this.prisma.product.findMany({ orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }], include: { course: { select: { slug: true } }, _count: { select: { items: true, variants: true } } } });
  }

  async getProductAdmin(id: string) {
    const p = await this.prisma.product.findFirst({ where: { OR: [{ id }, { sku: id }] }, include: { course: { select: { slug: true } }, variants: { orderBy: { sortOrder: 'asc' } }, _count: { select: { items: true } } } });
    if (!p) throw new NotFoundException('product not found');
    return p;
  }

  /** 刪除商品：有訂單紀錄只能下架；課程商品請由課程管理處理 */
  async deleteProduct(id: string) {
    const p = await this.prisma.product.findUnique({ where: { id }, include: { _count: { select: { items: true } }, course: { select: { id: true } } } });
    if (!p) throw new NotFoundException('product not found');
    if (p.course) throw new BadRequestException('課程商品請到「課程管理」處理');
    if (p._count.items > 0) throw new BadRequestException('此商品已有訂單紀錄，不能刪除；請改為下架');
    await this.prisma.product.delete({ where: { id } });
    this.reval.trigger('catalog');
    return { deleted: p.sku };
  }

  /** 多規格整組覆寫：有 id 的更新、沒有的新增、未列出的刪除（已有訂單的改為下架） */
  async setVariants(productId: string, input: unknown) {
    const d0 = parse(variantsInput, input);
    const d = { specs: d0.specs ?? [], variants: d0.variants ?? [] };
    const p = await this.prisma.product.findUnique({ where: { id: productId }, include: { variants: { include: { _count: { select: { items: true } } } } } });
    if (!p) throw new NotFoundException('product not found');
    const skus = d.variants.map((v) => v.sku);
    if (new Set(skus).size !== skus.length) throw new BadRequestException('規格 SKU 重複');
    const keep = new Set(d.variants.map((v) => v.id).filter(Boolean));
    await this.prisma.$transaction(async (tx) => {
      for (const old of p.variants) {
        if (keep.has(old.id)) continue;
        if (old._count.items > 0) await tx.productVariant.update({ where: { id: old.id }, data: { isActive: false } });
        else await tx.productVariant.delete({ where: { id: old.id } });
      }
      for (const v of d.variants) {
        const data = { name: v.name, sku: v.sku, price: v.price ?? null, stock: v.stock ?? null, isActive: v.isActive, sortOrder: v.sortOrder, options: v.options as Prisma.InputJsonValue };
        if (v.id && p.variants.some((x) => x.id === v.id)) await tx.productVariant.update({ where: { id: v.id }, data });
        else await tx.productVariant.create({ data: { ...data, productId } });
      }
      await tx.product.update({ where: { id: productId }, data: { specs: d.specs as unknown as Prisma.InputJsonValue } });
    });
    return this.getProductAdmin(productId).then((x) => ({ specs: x.specs, variants: x.variants }));
  }

  /** 庫存調整：set 絕對值（null＝不追蹤）或 delta 增減（不可低於 0）。 */
  async adjustStock(skuOrId: string, set?: number | null, delta?: number) {
    const p = await this.prisma.product.findFirst({ where: { OR: [{ id: skuOrId }, { sku: skuOrId }] } });
    if (!p) throw new NotFoundException('product not found');
    let stock: number | null = p.stock;
    if (set !== undefined) stock = set === null ? null : Math.max(0, Math.round(set));
    if (delta !== undefined) stock = Math.max(0, (stock ?? 0) + Math.round(delta));
    const u = await this.prisma.product.update({ where: { id: p.id }, data: { stock } });
    return { id: u.id, sku: u.sku, name: u.name, stock: u.stock, before: p.stock };
  }

  listCourses() {
    return this.prisma.course.findMany({
      where: { isPublished: true, product: { isActive: true, hidden: false } },
      orderBy: [{ publishedAt: 'desc' }, { product: { createdAt: 'desc' } }],
      select: { id: true, slug: true, summary: true, instructorName: true, publishedAt: true, product: { select: { id: true, name: true, description: true, coverUrl: true, price: true, salePrice: true, saleStartsAt: true, saleEndsAt: true, tags: true, category: true } }, _count: { select: { chapters: { where: { isPublished: true } } } } },
    });
  }

  async getCourse(slug: string) {
    const c = await this.prisma.course.findFirst({
      where: { slug, isPublished: true },
      include: {
        product: { select: { id: true, name: true, description: true, coverUrl: true, price: true, salePrice: true, saleStartsAt: true, saleEndsAt: true, tags: true, category: true, isActive: true } },
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

  private productData(d: Partial<z.infer<typeof productInput>>) {
    return { ...d, ...(d.saleStartsAt !== undefined ? { saleStartsAt: d.saleStartsAt ? new Date(d.saleStartsAt) : null } : {}), ...(d.saleEndsAt !== undefined ? { saleEndsAt: d.saleEndsAt ? new Date(d.saleEndsAt) : null } : {}) };
  }

  createProduct(input: unknown) {
    const d = parse(productInput, input);
    this.reval.trigger('catalog');
    return this.prisma.product.create({ data: { ...this.productData(d), type: d.type, sku: d.sku, name: d.name, price: d.price } });
  }

  updateProduct(id: string, input: unknown) {
    this.reval.trigger('catalog');
    return this.prisma.product.update({ where: { id }, data: this.productData(parse(productInput.partial(), input)) });
  }

  private courseData(d: Omit<Partial<z.infer<typeof courseInput>>, 'product'>) {
    return {
      slug: d.slug,
      summary: d.summary,
      isPublished: d.isPublished,
      ...(d.coverVideo !== undefined ? { coverVideoProvider: d.coverVideo?.provider ?? null, coverVideoId: d.coverVideo?.id || null } : {}),
      ...(d.previewVideo !== undefined ? { previewVideoProvider: d.previewVideo?.provider ?? null, previewVideoId: d.previewVideo?.id || null } : {}),
      accessMode: d.accessMode,
      accessDays: d.accessDays,
      ...(d.accessUntil !== undefined ? { accessUntil: d.accessUntil ? new Date(d.accessUntil) : null } : {}),
      ...(d.publishedAt !== undefined ? { publishedAt: d.publishedAt ? new Date(d.publishedAt) : null } : {}),
      instructorName: d.instructorName,
      instructorBio: d.instructorBio,
      purchaseNote: d.purchaseNote,
      buttonText: d.buttonText,
    };
  }

  createCourse(input: unknown) {
    const d = parse(courseInput, input);
    this.reval.trigger('catalog');
    return this.prisma.course.create({
      data: { ...this.courseData(d), slug: d.slug, product: { create: { ...this.productData(d.product), sku: d.product.sku, name: d.product.name, price: d.product.price, type: 'course' } } },
      include: { product: true },
    });
  }

  updateCourse(id: string, input: unknown) {
    const d = parse(courseInput.partial().extend({ product: productInput.omit({ type: true }).partial().optional() }), input);
    this.reval.trigger('catalog');
    return this.prisma.course.update({
      where: { id },
      data: { ...this.courseData(d), ...(d.product ? { product: { update: this.productData(d.product) } } : {}) },
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

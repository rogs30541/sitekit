import { Injectable } from '../../compat';
import { readFile } from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { StorageService } from '../storage/storage.service';
import { fromCsv } from './connectors/csv';
import { fromProductsCsv } from './connectors/products-csv';
import { fetchWordPress } from './connectors/wordpress';
import { type CanonicalContent, pathOf } from './normalize';

const paramsSchema = z.object({
  source: z.enum(['wordpress', 'csv']),
  sourceUrl: z.string().url().optional(),
  csv: z.string().optional(),
  filePath: z.string().optional(),
  dryRun: z.boolean().default(true),
  limit: z.number().int().min(1).max(2000).default(200),
  publish: z.boolean().default(true),
  /** 媒體落地：把內文 <img> 與封面圖下載到本站儲存（local／R2）並改寫網址；同來源網址只下載一次 */
  landMedia: z.boolean().default(false),
});

const productParams = z.object({
  csv: z.string().optional(),
  filePath: z.string().optional(),
  dryRun: z.boolean().default(true),
  limit: z.number().int().min(1).max(5000).default(1000),
  /** 既有商品是否覆寫庫存（預設 false：只在新建時帶入，避免蓋掉即時庫存） */
  updateStock: z.boolean().default(false),
});

/**
 * 外站內容原生搬運器 v1：探索 → 連接器 → 正規化 → 乾跑 → 冪等匯入（source + externalId）→ 301 導向表。
 * 媒體落地（下載到 R2）留 P4。
 */
@Injectable()
export class MigrationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
  ) {}

  /** 媒體落地：回傳改寫後的 body／coverUrl 與統計。失敗的圖保留原網址。 */
  async landMedia(items: CanonicalContent[], cache = new Map<string, string | null>()) {
    let downloaded = 0;
    let failed = 0;
    const land = async (src: string): Promise<string> => {
      if (!/^https?:\/\//i.test(src)) return src;
      if (cache.has(src)) return cache.get(src) ?? src;
      const got = await this.storage.fetchRemote(src);
      if (!got) {
        cache.set(src, null);
        failed++;
        return src;
      }
      const put = await this.storage.put(StorageService.keyFor('media', src, got.mime), got.bytes, got.mime);
      cache.set(src, put.url);
      downloaded++;
      return put.url;
    };
    for (const it of items) {
      if (it.coverUrl) it.coverUrl = await land(it.coverUrl);
      if (it.body) {
        const srcs = [...it.body.matchAll(/<img\b[^>]*?\ssrc=["']([^"']+)["']/gi)].map((m) => m[1]);
        for (const src of new Set(srcs)) {
          const to = await land(src);
          if (to !== src) it.body = it.body.split(src).join(to);
        }
      }
    }
    return { downloaded, failed };
  }

  async run(raw: Record<string, unknown>) {
    const p = paramsSchema.parse(raw);
    const items = await this.collect(p);
    const plan = await this.plan(items);
    if (p.dryRun) {
      const imgs = items.reduce((n, i) => n + (i.body?.match(/<img\b/gi)?.length ?? 0) + (i.coverUrl ? 1 : 0), 0);
      return { dryRun: true, source: p.source, total: items.length, toCreate: plan.create.length, toUpdate: plan.update.length, mediaCount: imgs, landMedia: p.landMedia, sample: items.slice(0, 5).map((i) => ({ title: i.title, slug: i.slug, originalUrl: i.originalUrl })) };
    }
    const media = p.landMedia ? await this.landMedia(items) : null;
    let redirects = 0;
    for (const item of items) {
      await this.prisma.content.upsert({
        where: { source_externalId: { source: item.source, externalId: item.externalId } },
        update: this.toData(item, p.publish),
        create: this.toData(item, p.publish),
      });
      const from = pathOf(item.originalUrl);
      const to = `/blog/${item.slug}`;
      if (from && from !== to) {
        await this.prisma.redirect.upsert({ where: { fromPath: from }, update: { toPath: to, source: item.source }, create: { fromPath: from, toPath: to, code: 301, source: item.source } });
        redirects++;
      }
    }
    return { dryRun: false, source: p.source, imported: items.length, created: plan.create.length, updated: plan.update.length, redirects, media };
  }

  /** 商品 CSV 匯入（簡式或 Shopify 匯出）：以 sku 冪等 upsert；dryRun 只回計畫。 */
  async runProducts(raw: Record<string, unknown>) {
    const p = productParams.parse(raw);
    const text = p.csv ?? (p.filePath ? await readFile(p.filePath, 'utf8') : null);
    if (!text) throw new Error('csv text or filePath is required');
    const items = fromProductsCsv(text).slice(0, p.limit);
    const existing = await this.prisma.product.findMany({ where: { sku: { in: items.map((i) => i.sku) } }, select: { sku: true } });
    const seen = new Set(existing.map((e) => e.sku));
    const toCreate = items.filter((i) => !seen.has(i.sku));
    const toUpdate = items.filter((i) => seen.has(i.sku));
    if (p.dryRun) return { dryRun: true, total: items.length, toCreate: toCreate.length, toUpdate: toUpdate.length, sample: items.slice(0, 5).map(({ sku, name, price, stock, type }) => ({ sku, name, price, stock, type })) };
    for (const i of items) {
      const data = { name: i.name, price: i.price, description: i.description, coverUrl: i.coverUrl, isActive: i.isActive, ...(p.updateStock ? { stock: i.stock } : {}) };
      await this.prisma.product.upsert({ where: { sku: i.sku }, update: data, create: { sku: i.sku, type: i.type, stock: i.stock, ...data } });
    }
    return { dryRun: false, imported: items.length, created: toCreate.length, updated: toUpdate.length };
  }

  private async collect(p: z.infer<typeof paramsSchema>): Promise<CanonicalContent[]> {
    if (p.source === 'wordpress') {
      if (!p.sourceUrl) throw new Error('sourceUrl is required for wordpress');
      return fetchWordPress(p.sourceUrl, p.limit);
    }
    const text = p.csv ?? (p.filePath ? await readFile(p.filePath, 'utf8') : null);
    if (!text) throw new Error('csv text or filePath is required for csv');
    return fromCsv(text).slice(0, p.limit);
  }

  private async plan(items: CanonicalContent[]) {
    const existing = await this.prisma.content.findMany({
      where: { OR: items.map((i) => ({ source: i.source, externalId: i.externalId })) },
      select: { source: true, externalId: true },
    });
    const seen = new Set(existing.map((e) => `${e.source}:${e.externalId}`));
    const create = items.filter((i) => !seen.has(`${i.source}:${i.externalId}`));
    const update = items.filter((i) => seen.has(`${i.source}:${i.externalId}`));
    return { create, update };
  }

  private toData(i: CanonicalContent, publish: boolean) {
    return {
      source: i.source,
      externalId: i.externalId,
      type: i.type,
      title: i.title,
      slug: i.slug,
      body: i.body,
      excerpt: i.excerpt,
      coverUrl: i.coverUrl,
      author: i.author,
      tags: i.tags,
      originalUrl: i.originalUrl,
      canonicalUrl: `/blog/${i.slug}`,
      publishedAt: i.publishedAt ?? new Date(),
      status: publish ? ('published' as const) : ('draft' as const),
      raw: (i.raw ?? null) as Prisma.InputJsonValue,
    };
  }
}

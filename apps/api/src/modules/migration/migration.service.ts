import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { fromCsv } from './connectors/csv';
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
});

/**
 * 外站內容原生搬運器 v1：探索 → 連接器 → 正規化 → 乾跑 → 冪等匯入（source + externalId）→ 301 導向表。
 * 媒體落地（下載到 R2）留 P4。
 */
@Injectable()
export class MigrationService {
  constructor(private readonly prisma: PrismaService) {}

  async run(raw: Record<string, unknown>) {
    const p = paramsSchema.parse(raw);
    const items = await this.collect(p);
    const plan = await this.plan(items);
    if (p.dryRun) {
      return { dryRun: true, source: p.source, total: items.length, toCreate: plan.create.length, toUpdate: plan.update.length, sample: items.slice(0, 5).map((i) => ({ title: i.title, slug: i.slug, originalUrl: i.originalUrl })) };
    }
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
    return { dryRun: false, source: p.source, imported: items.length, created: plan.create.length, updated: plan.update.length, redirects };
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

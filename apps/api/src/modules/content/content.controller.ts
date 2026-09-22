import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** 公開內容 API：只回 published，body 只在單篇回傳。 */
@Controller('content')
export class ContentController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('posts')
  async posts(@Query('page') page = '1', @Query('limit') limit = '20', @Query('tag') tag?: string) {
    const take = Math.min(Math.max(Number(limit) || 20, 1), 50);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where = { status: 'published' as const, type: 'post', ...(tag ? { tags: { has: tag } } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.content.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take,
        select: { slug: true, title: true, excerpt: true, coverUrl: true, author: true, tags: true, publishedAt: true, updatedAt: true },
      }),
      this.prisma.content.count({ where }),
    ]);
    return { items, total, page: Number(page) || 1, limit: take };
  }

  @Get('posts/:slug')
  async post(@Param('slug') slug: string) {
    const item = await this.prisma.content.findFirst({
      where: { slug, status: 'published' },
      select: { slug: true, title: true, body: true, excerpt: true, coverUrl: true, author: true, tags: true, publishedAt: true, updatedAt: true, canonicalUrl: true },
    });
    if (!item) throw new NotFoundException('post not found');
    return item;
  }

  /** 官網頁面（type=page；後台編輯器建立），例：home、about、faq */
  @Get('pages/:slug')
  async page(@Param('slug') slug: string) {
    const item = await this.prisma.content.findFirst({
      where: { slug, status: 'published', type: 'page' },
      select: { slug: true, title: true, body: true, excerpt: true, coverUrl: true, publishedAt: true, updatedAt: true, version: true, design: true },
    });
    if (!item) throw new NotFoundException('page not found');
    const { design, ...rest } = item;
    const tracking = design && typeof design === 'object' && (design as { settings?: { tracking?: unknown } }).settings?.tracking ? (design as { settings: { tracking: unknown } }).settings.tracking : null;
    return { ...rest, hasDesign: !!design, tracking };
  }

  /** 供 web middleware 套用 301 導向表。 */
  @Get('redirects')
  async redirects() {
    return this.prisma.redirect.findMany({ select: { fromPath: true, toPath: true, code: true } });
  }
}

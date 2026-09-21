import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { UserSessionGuard, type AuthedRequest } from '../../common/guards';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { SettingsService } from '../settings/settings.service';

/** Bunny Stream Token Authentication：SHA256(signingKey + videoId + expires)（移植自度哥 payment.ts）。 */
export function bunnySign(signingKey: string, videoId: string, expires: number) {
  return createHash('sha256').update(`${signingKey}${videoId}${expires}`).digest('hex');
}

/**
 * 登入後的學習 API：授權（含觀看期限）在後端檢查，播放設定只在通過後回傳。
 * - bunny：簽章網址 1 小時時效
 * - youtube：回傳 nocookie 內嵌參數；前端自製播放器蓋掉 YouTube UI。影片 ID 不出現在公開頁面或 SSR HTML。
 * - 進度：每人每章一筆，≥90% 或手動標記＝完成
 */
@Controller('learn')
@UseGuards(UserSessionGuard)
export class LearnController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
  ) {}

  private async entitlement(userId: string, productId: string) {
    const e = await this.prisma.entitlement.findUnique({ where: { userId_productId: { userId, productId } } });
    const active = !!e && (!e.expiresAt || e.expiresAt > new Date());
    return { active, expiresAt: e?.expiresAt ?? null };
  }

  @Get('courses/:slug')
  async course(@Param('slug') slug: string, @Req() req: AuthedRequest) {
    const c = await this.catalog.getCourse(slug);
    const userId = req.session!.user.id;
    const ent = await this.entitlement(userId, c.product.id);
    const rows = await this.prisma.chapterProgress.findMany({ where: { userId, chapterId: { in: c.chapters.map((ch) => ch.id) } } });
    const progress = Object.fromEntries(rows.map((p) => [p.chapterId, { positionSec: p.positionSec, completed: !!p.completedAt }]));
    const total = c.chapters.filter((ch) => ch.hasVideo).length;
    const done = c.chapters.filter((ch) => ch.hasVideo && progress[ch.id]?.completed).length;
    return { ...c, entitled: ent.active, expiresAt: ent.expiresAt, progress, summaryProgress: { total, done, percent: total ? Math.round((done / total) * 100) : 0 } };
  }

  private async loadChapter(chapterId: string, userId: string) {
    const ch = await this.prisma.chapter.findUnique({ where: { id: chapterId }, include: { course: { select: { isPublished: true, productId: true } } } });
    if (!ch || !ch.isPublished || !ch.course.isPublished) throw new NotFoundException('chapter not found');
    if (!ch.isPreview && !(await this.entitlement(userId, ch.course.productId)).active) throw new ForbiddenException('not entitled or access expired');
    return ch;
  }

  @Post('progress/:chapterId')
  async progress(@Param('chapterId') chapterId: string, @Body() body: { positionSec?: number; completed?: boolean }, @Req() req: AuthedRequest) {
    const userId = req.session!.user.id;
    await this.loadChapter(chapterId, userId);
    const positionSec = Math.max(0, Math.floor(Number(body?.positionSec ?? 0)));
    const existing = await this.prisma.chapterProgress.findUnique({ where: { userId_chapterId: { userId, chapterId } } });
    const completedAt = body?.completed === true ? new Date() : body?.completed === false ? null : (existing?.completedAt ?? null);
    const row = await this.prisma.chapterProgress.upsert({
      where: { userId_chapterId: { userId, chapterId } },
      update: { positionSec: Math.max(positionSec, body?.completed === undefined ? 0 : 0), completedAt },
      create: { userId, chapterId, positionSec, completedAt },
    });
    return { ok: true, chapterId, positionSec: row.positionSec, completed: !!row.completedAt };
  }

  @Get('play/:chapterId')
  async play(@Param('chapterId') chapterId: string, @Req() req: AuthedRequest) {
    const ch = await this.loadChapter(chapterId, req.session!.user.id);
    if (!ch.videoProviderId) return { provider: 'none', message: 'video not attached yet' };

    if (ch.videoProvider === 'youtube') {
      const asset = await this.prisma.videoAsset.findUnique({ where: { provider_externalId: { provider: 'youtube', externalId: ch.videoProviderId } } });
      return {
        provider: 'youtube',
        configured: true,
        videoId: ch.videoProviderId,
        host: 'https://www.youtube-nocookie.com',
        poster: asset?.thumbnailUrl ?? null,
        title: ch.title,
        expires: Math.floor(Date.now() / 1000) + 3600,
      };
    }

    const bunny = await this.settings.bunny();
    if (!bunny.configured) return { provider: 'bunny', configured: false, message: 'bunny is not configured' };
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = bunnySign(bunny.signingKey, ch.videoProviderId, expires);
    return {
      provider: 'bunny',
      configured: true,
      libraryId: bunny.libraryId,
      videoId: ch.videoProviderId,
      token,
      expires,
      embedUrl: `https://iframe.mediadelivery.net/embed/${bunny.libraryId}/${ch.videoProviderId}?token=${token}&expires=${expires}&autoplay=false`,
    };
  }
}

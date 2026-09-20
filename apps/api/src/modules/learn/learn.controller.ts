import { Controller, ForbiddenException, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { UserSessionGuard, type AuthedRequest } from '../../common/guards';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { SettingsService } from '../settings/settings.service';

/** Bunny Stream Token Authentication：SHA256(signingKey + videoId + expires)（移植自度哥 payment.ts）。 */
export function bunnySign(signingKey: string, videoId: string, expires: number) {
  return createHash('sha256').update(`${signingKey}${videoId}${expires}`).digest('hex');
}

/** 登入後的學習 API：授權檢查在後端，影片網址即時簽發、帶時效。 */
@Controller('learn')
@UseGuards(UserSessionGuard)
export class LearnController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
  ) {}

  private async entitled(userId: string, productId: string) {
    const e = await this.prisma.entitlement.findUnique({ where: { userId_productId: { userId, productId } } });
    return !!e && (!e.expiresAt || e.expiresAt > new Date());
  }

  @Get('courses/:slug')
  async course(@Param('slug') slug: string, @Req() req: AuthedRequest) {
    const c = await this.catalog.getCourse(slug, false);
    const entitled = await this.entitled(req.session!.user.id, c.product.id);
    return { ...c, entitled };
  }

  @Get('play/:chapterId')
  async play(@Param('chapterId') chapterId: string, @Req() req: AuthedRequest) {
    const ch = await this.prisma.chapter.findUnique({ where: { id: chapterId }, include: { course: { select: { isPublished: true, productId: true } } } });
    if (!ch || !ch.course.isPublished) throw new NotFoundException('chapter not found');
    if (!ch.isPreview && !(await this.entitled(req.session!.user.id, ch.course.productId))) throw new ForbiddenException('not entitled');
    if (!ch.videoProviderId) return { provider: 'none', message: 'video not attached yet' };
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

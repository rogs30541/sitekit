import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../../common/guards';
import { BRAND_FIELDS, SiteService } from '@sitekit/core';

@Controller('content')
export class PublicSiteController {
  constructor(private readonly site: SiteService) {}

  @Get('site')
  get() {
    return this.site.publicSite();
  }

  /** 已發布頁面清單（sitemap／選單用） */
  @Get('pages')
  pages() {
    return this.site['prisma'].content.findMany({ where: { type: 'page', status: 'published' }, orderBy: { updatedAt: 'desc' }, take: 500, select: { slug: true, title: true, updatedAt: true } });
  }
}

@Controller('admin/site')
@UseGuards(AdminSessionGuard)
export class AdminSiteController {
  constructor(private readonly site: SiteService) {}

  @Get()
  get() {
    return this.site.adminSite();
  }

  /** 網站層級追蹤碼 */
  @Put('tracking')
  tracking(@Body() body: unknown) {
    return this.site.setTracking(body);
  }

  /** 首頁版面區塊（驗證後存 home.sections） */
  @Put('home')
  home(@Body() body: unknown) {
    return this.site.setHomeSections(body);
  }
}

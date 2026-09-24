import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { AdminContentController } from './admin-content.controller';
import { AdminMenuController, PublicMenuController } from './menu.controller';
import { MenuService, SiteService, SiteTemplateService } from '@sitekit/core';
import { AdminSiteController, PublicSiteController } from './site.controller';
import { AdminDesignController, PublicPreviewController } from './design.controller';
import { DesignService } from '@sitekit/core';

@Module({ controllers: [ContentController, PublicPreviewController, AdminDesignController, AdminContentController, PublicMenuController, AdminMenuController, PublicSiteController, AdminSiteController], providers: [MenuService, SiteService, DesignService, SiteTemplateService], exports: [MenuService, SiteService, DesignService, SiteTemplateService] })
export class ContentModule {}

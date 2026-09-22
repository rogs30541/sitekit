import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { AdminContentController } from './admin-content.controller';
import { AdminMenuController, MenuService, PublicMenuController } from './menu.controller';
import { AdminSiteController, PublicSiteController, SiteService } from './site.controller';
import { AdminDesignController, PublicPreviewController } from './design.controller';
import { DesignService } from './design.service';

@Module({ controllers: [ContentController, PublicPreviewController, AdminDesignController, AdminContentController, PublicMenuController, AdminMenuController, PublicSiteController, AdminSiteController], providers: [MenuService, SiteService, DesignService], exports: [MenuService, SiteService, DesignService] })
export class ContentModule {}

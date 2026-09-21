import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { AdminContentController } from './admin-content.controller';
import { AdminMenuController, MenuService, PublicMenuController } from './menu.controller';
import { AdminSiteController, PublicSiteController, SiteService } from './site.controller';

@Module({ controllers: [ContentController, AdminContentController, PublicMenuController, AdminMenuController, PublicSiteController, AdminSiteController], providers: [MenuService, SiteService], exports: [MenuService, SiteService] })
export class ContentModule {}

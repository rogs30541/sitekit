import { Module } from '@nestjs/common';
import { AdminMessagesController, PublicContactController } from './contact.controller';
import { ContentController } from './content.controller';
import { AdminContentController } from './admin-content.controller';
import { AdminMenuController, PublicMenuController } from './menu.controller';
import { ContactService, MenuService, SiteService, SiteTemplateService } from '@sitekit/core';
import { AdminSiteController, PublicSiteController } from './site.controller';
import { AdminDesignController, PublicPreviewController } from './design.controller';
import { DesignService } from '@sitekit/core';

@Module({ controllers: [ContentController, PublicPreviewController, AdminDesignController, AdminContentController, PublicMenuController, AdminMenuController, PublicSiteController, AdminSiteController, PublicContactController, AdminMessagesController], providers: [MenuService, SiteService, DesignService, SiteTemplateService, ContactService], exports: [MenuService, SiteService, DesignService, SiteTemplateService, ContactService] })
export class ContentModule {}

import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { AdminContentController } from './admin-content.controller';
import { AdminMenuController, MenuService, PublicMenuController } from './menu.controller';

@Module({ controllers: [ContentController, AdminContentController, PublicMenuController, AdminMenuController], providers: [MenuService], exports: [MenuService] })
export class ContentModule {}

import { Module } from '@nestjs/common';
import { AdminCatalogController, CatalogController } from './catalog.controller';
import { CatalogService } from '@sitekit/core';

@Module({ controllers: [CatalogController, AdminCatalogController], providers: [CatalogService], exports: [CatalogService] })
export class CatalogModule {}

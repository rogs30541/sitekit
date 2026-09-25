import { Module } from '@nestjs/common';
import { AdminSalesController, PublicSalesController } from './sales.controller';
import { SalesService, SalesTemplateService } from '@sitekit/core';

@Module({ controllers: [PublicSalesController, AdminSalesController], providers: [SalesService, SalesTemplateService], exports: [SalesService, SalesTemplateService] })
export class SalesModule {}

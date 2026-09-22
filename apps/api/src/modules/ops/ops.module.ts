import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { StudioModule } from '../studio/studio.module';
import { SalesModule } from '../sales/sales.module';
import { MigrationModule } from '../migration/migration.module';
import { CreditsModule } from '../credits/credits.module';
import { OrdersModule } from '../orders/orders.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ContentModule } from '../content/content.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({ imports: [AdminModule, SalesModule, StudioModule, MigrationModule, CreditsModule, OrdersModule, CatalogModule, ContentModule, InvoiceModule], controllers: [OpsController], providers: [OpsService], exports: [OpsService] })
export class OpsModule {}

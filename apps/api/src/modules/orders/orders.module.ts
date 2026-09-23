import { Module } from '@nestjs/common';
import { InvoiceModule } from '../invoice/invoice.module';
import { CouponsService } from '@sitekit/core';
import { AdminCouponsController, AdminOrdersController, AdminReportsController, OrdersController } from './orders.controller';
import { OrdersService } from '@sitekit/core';
import { ReportsService } from '@sitekit/core';

@Module({ imports: [InvoiceModule], controllers: [OrdersController, AdminOrdersController, AdminReportsController, AdminCouponsController], providers: [OrdersService, CouponsService, ReportsService], exports: [OrdersService, CouponsService, ReportsService] })
export class OrdersModule {}

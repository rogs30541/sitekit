import { Module } from '@nestjs/common';
import { InvoiceModule } from '../invoice/invoice.module';
import { CouponsService } from './coupons.service';
import { AdminCouponsController, AdminOrdersController, AdminReportsController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ReportsService } from './reports.service';

@Module({ imports: [InvoiceModule], controllers: [OrdersController, AdminOrdersController, AdminReportsController, AdminCouponsController], providers: [OrdersService, CouponsService, ReportsService], exports: [OrdersService, CouponsService, ReportsService] })
export class OrdersModule {}

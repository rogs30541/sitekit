import { Module } from '@nestjs/common';
import { InvoiceModule } from '../invoice/invoice.module';
import { AdminOrdersController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({ imports: [InvoiceModule], controllers: [OrdersController, AdminOrdersController], providers: [OrdersService], exports: [OrdersService] })
export class OrdersModule {}

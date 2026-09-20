import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { AdminPaymentsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({ imports: [OrdersModule], controllers: [PaymentsController, AdminPaymentsController], providers: [PaymentsService], exports: [PaymentsService] })
export class PaymentsModule {}

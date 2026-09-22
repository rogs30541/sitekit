import { Module } from '@nestjs/common';
import { AdminSalesController, PublicSalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({ controllers: [PublicSalesController, AdminSalesController], providers: [SalesService], exports: [SalesService] })
export class SalesModule {}

import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { AdminInvoiceController } from './invoice.controller';

@Module({ controllers: [AdminInvoiceController], providers: [InvoiceService], exports: [InvoiceService] })
export class InvoiceModule {}

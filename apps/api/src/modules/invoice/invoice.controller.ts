import { BadRequestException, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminSessionGuard, type AuthedRequest } from '../../common/guards';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceService } from '@sitekit/core';

@Controller('admin/invoices')
@UseGuards(AdminSessionGuard)
export class AdminInvoiceController {
  constructor(
    private readonly invoice: InvoiceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('config')
  async config() {
    const c = await this.invoice.config();
    return { provider: c.provider, timing: c.timing, ezpay: { ready: c.ezpay.ready, merchantId: c.ezpay.merchantId, testMode: c.ezpay.testMode }, ecpay: { ready: c.ecpay.ready, merchantId: c.ecpay.merchantId, testMode: c.ecpay.testMode }, amego: { ready: c.amego.ready, taxId: c.amego.taxId, testMode: c.amego.testMode } };
  }

  @Get()
  list(@Query('status') status?: string) {
    return this.invoice.list(status);
  }

  /** 手動開立（issueTiming=manual 或自動失敗後補開） */
  @Post('orders/:idOrNo/issue')
  async issue(@Param('idOrNo') idOrNo: string, @Req() req: AuthedRequest) {
    const order = await this.prisma.order.findFirst({ where: { OR: [{ id: idOrNo }, { merchantOrderNo: idOrNo }] }, include: { items: true, user: { select: { email: true, displayName: true } } } });
    if (!order) throw new BadRequestException('order not found');
    return this.invoice.issue(order, req.session!.user.email);
  }

  @Post('orders/:idOrNo/invalidate')
  async invalidate(@Param('idOrNo') idOrNo: string) {
    const order = await this.prisma.order.findFirst({ where: { OR: [{ id: idOrNo }, { merchantOrderNo: idOrNo }] } });
    if (!order) throw new BadRequestException('order not found');
    const r = await this.invoice.invalidateForOrder(order.id, '後台作廢');
    if (!r) throw new BadRequestException('作廢失敗或無已開立發票');
    return r;
  }
}

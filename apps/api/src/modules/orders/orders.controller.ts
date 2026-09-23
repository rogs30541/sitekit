import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminSessionGuard, UserSessionGuard, type AuthedRequest } from '../../common/guards';
import { CouponsService } from '@sitekit/core';
import { OrdersService } from '@sitekit/core';
import { ReportsService } from '@sitekit/core';

@Controller('orders')
@UseGuards(UserSessionGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: unknown, @Req() req: AuthedRequest) {
    return this.orders.create(req.session!.user.id, body);
  }

  /** 購物車試算（折扣碼、運費、應付）；不建單。 */
  @Post('quote')
  quote(@Body() body: unknown) {
    return this.orders.quote(body);
  }

  @Get('mine')
  mine(@Req() req: AuthedRequest) {
    return this.orders.listMine(req.session!.user.id);
  }

  @Get(':idOrNo')
  get(@Param('idOrNo') idOrNo: string, @Req() req: AuthedRequest) {
    return this.orders.getOwned(idOrNo, req.session!.user.id);
  }

  @Post(':idOrNo/cancel')
  cancel(@Param('idOrNo') idOrNo: string, @Req() req: AuthedRequest) {
    return this.orders.cancel(idOrNo, req.session!.user.id);
  }

  @Post(':idOrNo/refund-request')
  refundRequest(@Param('idOrNo') idOrNo: string, @Body() body: { reason?: string }, @Req() req: AuthedRequest) {
    return this.orders.requestRefund(idOrNo, req.session!.user.id, body?.reason ?? '');
  }
}

@Controller('admin/orders')
@UseGuards(AdminSessionGuard)
export class AdminOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly reports: ReportsService,
  ) {}

  @Get()
  list(@Query('status') status?: string, @Query('shipping') shipping?: string, @Query('scope') scope?: string) {
    return this.orders.listAll(status, shipping, scope);
  }

  /** 對帳檔：?from=YYYY-MM-DD&to=YYYY-MM-DD&status=paid */
  @Get('export.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="orders.csv"')
  exportCsv(@Query() q: Record<string, string>) {
    return this.reports.ordersCsv(q);
  }

  @Get(':idOrNo')
  get(@Param('idOrNo') idOrNo: string) {
    return this.orders.findByIdOrNo(idOrNo);
  }

  /** 匯款核帳等人工確認：標記已付款並發授權。 */
  @Post(':idOrNo/mark-paid')
  async markPaid(@Param('idOrNo') idOrNo: string, @Body() body: { note?: string }, @Req() req: AuthedRequest) {
    const o = await this.orders.findByIdOrNo(idOrNo);
    return this.orders.markPaid(o.id, { provider: 'manual', note: `by ${req.session!.user.email}${body?.note ? `: ${body.note}` : ''}` });
  }

  /** 物流狀態／物流商／追蹤碼 */
  @Patch(':idOrNo/shipping')
  shipping(@Param('idOrNo') idOrNo: string, @Body() body: unknown) {
    return this.orders.updateShipping(idOrNo, body);
  }

  @Post('expire')
  expire(@Body() body: { hours?: number }) {
    return this.orders.expirePending(body?.hours);
  }

  @Post('grant')
  grant(@Body() body: { userId: string; productId: string }) {
    return this.orders.grantManual(body.userId, body.productId);
  }
}

@Controller('admin/reports')
@UseGuards(AdminSessionGuard)
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** ?from&to&groupBy=day|month */
  @Get('sales')
  sales(@Query() q: Record<string, string>) {
    return this.reports.sales(q);
  }
}

@Controller('admin/coupons')
@UseGuards(AdminSessionGuard)
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list(@Query('scope') scope?: string) {
    return this.coupons.list(scope);
  }

  @Post()
  create(@Body() body: unknown) {
    return this.coupons.create(body);
  }

  @Patch(':idOrCode')
  update(@Param('idOrCode') idOrCode: string, @Body() body: unknown) {
    return this.coupons.update(idOrCode, body);
  }
}

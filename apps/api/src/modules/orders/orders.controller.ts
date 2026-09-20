import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminSessionGuard, UserSessionGuard, type AuthedRequest } from '../../common/guards';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(UserSessionGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() body: unknown, @Req() req: AuthedRequest) {
    return this.orders.create(req.session!.user.id, body);
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
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.orders.listAll(status);
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

  @Post('grant')
  grant(@Body() body: { userId: string; productId: string }) {
    return this.orders.grantManual(body.userId, body.productId);
  }
}

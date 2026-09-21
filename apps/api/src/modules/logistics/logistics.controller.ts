import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminSessionGuard, UserSessionGuard, type AuthedRequest } from '../../common/guards';
import { LogisticsService } from './logistics.service';

@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logistics: LogisticsService) {}

  /** 結帳可選配送方式（公開） */
  @Get('methods')
  methods() {
    return this.logistics.methods();
  }

  /** 綠界電子地圖：回表單，前端 POST 送出到綠界選門市 */
  @Post('ecpay/map')
  @UseGuards(UserSessionGuard)
  map(@Body() body: { subType?: string }, @Req() req: AuthedRequest) {
    return this.logistics.mapForm(String(body?.subType ?? ''), req.session!.user.id);
  }

  /** 綠界選完門市 POST 回來 → 303 導回購物車並帶簽章 token */
  @Post('ecpay/map-reply')
  async mapReply(@Body() body: Record<string, unknown>, @Res() res: Response) {
    res.redirect(303, await this.logistics.mapReply(body ?? {}));
  }

  /** 前端解出門市（驗章） */
  @Get('cvs-store')
  store(@Query('token') token: string) {
    const s = this.logistics.verifyStoreToken(token);
    return s ?? { error: 'invalid' };
  }

  /** 綠界物流狀態通知 */
  @Post('ecpay/notify')
  @HttpCode(200)
  notify(@Body() body: Record<string, unknown>) {
    return this.logistics.notify(body ?? {});
  }
}

@Controller('admin/logistics')
@UseGuards(AdminSessionGuard)
export class AdminLogisticsController {
  constructor(private readonly logistics: LogisticsService) {}

  @Get('config')
  async config() {
    const c = await this.logistics.config();
    return { provider: c.provider, ecpayReady: c.ecpayReady, merchantId: c.merchantId, testMode: c.testMode, methods: c.methods, sender: c.sender, manualFee: c.manualFee, freeOver: c.freeOver, fees: c.fees };
  }

  @Post('orders/:idOrNo/create')
  create(@Param('idOrNo') idOrNo: string, @Req() req: AuthedRequest) {
    return this.logistics.createOrder(idOrNo, req.session!.user.email);
  }

  /** 託運單列印表單（前端開新視窗 POST） */
  @Get('orders/:idOrNo/print')
  print(@Param('idOrNo') idOrNo: string) {
    return this.logistics.printForm(idOrNo);
  }
}

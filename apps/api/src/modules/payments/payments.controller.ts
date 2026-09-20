import { Body, Controller, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AdminSessionGuard, UserSessionGuard, type AuthedRequest } from '../../common/guards';
import { SettingsService } from '../settings/settings.service';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly settings: SettingsService,
  ) {}

  @Post('checkout/:idOrNo')
  @UseGuards(UserSessionGuard)
  checkout(@Param('idOrNo') idOrNo: string, @Req() req: AuthedRequest) {
    return this.payments.checkout(idOrNo, req.session!.user.id);
  }

  /** 藍新伺服器對伺服器回呼：唯一寫入授權的入口。回 200 純文字避免藍新重送。 */
  @Post('newebpay/notify')
  @HttpCode(200)
  async notify(@Body() body: Record<string, unknown>) {
    const r = await this.payments.handleNewebpay(body ?? {}, 'notify');
    return r.ok ? 'OK' : 'IGNORED';
  }

  /** 藍新前景導回：同樣處理一次（防 Notify 晚到），再導到訂單結果頁。 */
  @Post('newebpay/return')
  async returnUrl(@Body() body: Record<string, unknown>, @Res() res: Response) {
    const site = await this.settings.siteUrl();
    const r = await this.payments.handleNewebpay(body ?? {}, 'return').catch(() => ({ merchantOrderNo: null, ok: false }));
    res.redirect(303, r.merchantOrderNo ? `${site}/order-result?order=${encodeURIComponent(r.merchantOrderNo)}` : `${site}/order-result?error=1`);
  }

  /** 本機假閘道回呼（非 production）。 */
  @Post('mock/notify')
  mock(@Body() body: { order: string; sig: string; result: 'success' | 'fail' }) {
    return this.payments.handleMock(String(body?.order ?? ''), String(body?.sig ?? ''), body?.result === 'fail' ? 'fail' : 'success');
  }
}

@Controller('admin/payments')
@UseGuards(AdminSessionGuard)
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('refund/:idOrNo')
  refund(@Param('idOrNo') idOrNo: string, @Body() body: { approve?: boolean; note?: string }, @Req() req: AuthedRequest) {
    return this.payments.adminRefund(idOrNo, body?.approve !== false, body?.note, req.session!.user.email);
  }
}

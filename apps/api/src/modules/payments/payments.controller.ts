import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PAYMENT_METHOD_LABELS, PAYMENT_PROVIDERS } from '@sitekit/shared';
import { AdminSessionGuard, UserSessionGuard, type AuthedRequest } from '../../common/guards';
import { SettingsService } from '../settings/settings.service';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly settings: SettingsService,
  ) {}

  /** 結帳頁可選的付款方式（公開；只列已設定完成者） */
  @Get('methods')
  methods() {
    return this.payments.methods();
  }

  @Post('checkout/:idOrNo')
  @UseGuards(UserSessionGuard)
  checkout(@Param('idOrNo') idOrNo: string, @Body() body: { provider?: string } | undefined, @Req() req: AuthedRequest) {
    return this.payments.checkout(idOrNo, req.session!.user.id, body?.provider ? String(body.provider) : undefined);
  }

  /** 本機假閘道回呼（非 production）。宣告在 :provider 路由之前。 */
  @Post('mock/notify')
  mock(@Body() body: { order: string; sig: string; result: 'success' | 'fail' }) {
    return this.payments.handleMock(String(body?.order ?? ''), String(body?.sig ?? ''), body?.result === 'fail' ? 'fail' : 'success');
  }

  /** 金流商伺服器對伺服器回呼：唯一寫入授權的入口。回 200＋各家要求的字串避免重送。 */
  @Post(':provider/notify')
  @HttpCode(200)
  async notify(@Param('provider') provider: string, @Body() body: Record<string, unknown>) {
    const r = await this.payments.handle(provider, body ?? {}, 'notify');
    return r.ack;
  }

  /** 前景導回（POST：藍新／綠界／統一；GET：LINE Pay／支付連）：同樣處理一次（防 Notify 晚到），再導到訂單結果頁。 */
  @Post(':provider/return')
  returnPost(@Param('provider') provider: string, @Body() body: Record<string, unknown>, @Res() res: Response) {
    return this.finishReturn(provider, body ?? {}, res);
  }

  @Get(':provider/return')
  returnGet(@Param('provider') provider: string, @Query() query: Record<string, unknown>, @Res() res: Response) {
    return this.finishReturn(provider, query ?? {}, res);
  }

  private async finishReturn(provider: string, data: Record<string, unknown>, res: Response) {
    const site = await this.settings.siteUrl();
    const r = await this.payments.handle(provider, data, 'return').catch(() => ({ merchantOrderNo: null as string | null, ok: false }));
    res.redirect(303, r.merchantOrderNo ? `${site}/order-result?order=${encodeURIComponent(r.merchantOrderNo)}` : `${site}/order-result?error=1`);
  }
}

@Controller('admin/payments')
@UseGuards(AdminSessionGuard)
export class AdminPaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly settings: SettingsService,
  ) {}

  /** 後台金流設定總覽：各供應商是否設定完成、測試模式、非機密識別碼（機密不回傳）。 */
  @Get('config')
  async config() {
    const [methods, defaultProvider] = await Promise.all([this.settings.paymentMethods(), this.settings.paymentProvider()]);
    const providers = await Promise.all(
      PAYMENT_PROVIDERS.filter((p): p is Exclude<typeof p, 'none'> => p !== 'none').map(async (id) => {
        const cfg = await this.settings.gateway(id);
        return { id, label: PAYMENT_METHOD_LABELS[id], configured: cfg.configured, testMode: cfg.testMode, merchantId: cfg.merchantId, enabled: methods.includes(id) };
      }),
    );
    return { defaultProvider, methods, providers };
  }

  @Post('refund/:idOrNo')
  refund(@Param('idOrNo') idOrNo: string, @Body() body: { approve?: boolean; note?: string }, @Req() req: AuthedRequest) {
    return this.payments.adminRefund(idOrNo, body?.approve !== false, body?.note, req.session!.user.email);
  }
}

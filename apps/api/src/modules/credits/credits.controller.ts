import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminSessionGuard, UserSessionGuard, type AuthedRequest } from '../../common/guards';
import { CreditsService } from './credits.service';

@Controller('credits')
@UseGuards(UserSessionGuard)
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}

  @Get('me')
  me(@Req() req: AuthedRequest) {
    return this.credits.balance(req.session!.user.id);
  }

  @Get('ledger')
  ledger(@Req() req: AuthedRequest, @Query('limit') limit = '50') {
    return this.credits.ledger(req.session!.user.id, Number(limit) || 50);
  }
}

@Controller('admin/credits')
@UseGuards(AdminSessionGuard)
export class AdminCreditsController {
  constructor(private readonly credits: CreditsService) {}

  @Post('adjust')
  async adjust(@Body() body: { email?: string; userId?: string; amount: number; reason?: string }, @Req() req: AuthedRequest) {
    const user = await this.credits.findUser(String(body.userId ?? body.email ?? ''));
    const r = await this.credits.adjust(user.id, Number(body.amount), body.reason ?? 'admin adjust', `admin:${req.session!.user.email}`);
    return { userId: user.id, email: user.email, ...r };
  }

  @Get(':userId/ledger')
  ledger(@Param('userId') userId: string) {
    return this.credits.ledger(userId, 100);
  }
}

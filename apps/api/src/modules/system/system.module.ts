import { Body, Controller, Get, Module, type OnModuleInit, Post, Query, Req, Res, UseGuards, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ADMIN_COOKIE, AdminAuthService, SystemService } from '@sitekit/core';
import { AdminSessionGuard, type AuthedRequest } from '../../common/guards';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';

/** 安裝精靈（公開）：狀態、建立第一位超級管理員（只在 admin_users 為空時）、標記完成 */
@Controller('setup')
export class SetupController {
  constructor(
    private readonly system: SystemService,
    private readonly admins: AdminAuthService,
  ) {}

  @Get('status')
  status() {
    return this.system.setupStatus();
  }

  @Post('admin')
  async createAdmin(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const admin = await this.system.createFirstAdmin(body);
    const s = await this.admins.createSession(admin.id, req.headers['user-agent']);
    res.cookie(ADMIN_COOKIE, s.id, this.admins.cookieOptions());
    return { ok: true, admin };
  }

  @Post('complete')
  @UseGuards(AdminSessionGuard)
  complete(@Req() req: AuthedRequest) {
    return this.system.completeSetup(`admin:${req.session!.user.email}`);
  }
}

/** 後台「系統設定」：健康檢查、支援包、OPS token（superadmin） */
@Controller('admin/system')
@UseGuards(AdminSessionGuard)
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @Get('health')
  health() {
    return this.system.health();
  }

  @Get('support-bundle')
  async bundle(@Res() res: Response) {
    const b = await this.system.supportBundle();
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="sitekit-support-${b.generatedAt.slice(0, 19).replace(/[:T]/g, '-')}.json"`);
    res.send(JSON.stringify(b, null, 2));
  }

  private superOnly(req: AuthedRequest) {
    if (req.session?.user.role !== 'superadmin') throw new ForbiddenException('只有超級管理員可以檢視或更換 OPS token');
  }

  @Get('update-check')
  updateCheck(@Query('force') force?: string) {
    return this.system.updateCheck(force === '1');
  }

  @Get('ops-token')
  opsToken(@Req() req: AuthedRequest) {
    this.superOnly(req);
    return this.system.opsToken();
  }

  @Post('ops-token/rotate')
  rotate(@Req() req: AuthedRequest) {
    this.superOnly(req);
    return this.system.rotateOpsToken(`admin:${req.session!.user.email}`);
  }
}

@Module({ imports: [AdminAuthModule], controllers: [SetupController, SystemController], providers: [SystemService], exports: [SystemService] })
export class SystemModule implements OnModuleInit {
  constructor(private readonly system: SystemService) {}
  /** 啟動即補機密（在 listen 之前完成，OperatorTokenGuard 才讀得到自動產生的 OPS_TOKEN） */
  async onModuleInit() {
    await this.system.ensureSecrets();
  }
}

import { Body, Controller, Delete, Get, Module, type OnModuleInit, Param, Post, Query, Req, Res, UseGuards, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ADMIN_COOKIE, AdminAuthService, ExportService, SystemService } from '@sitekit/core';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
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
  constructor(
    private readonly system: SystemService,
    private readonly exporter: ExportService,
  ) {}

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

  @Get('plugins')
  plugins() {
    return this.system.plugins();
  }

  /* ---------- 匯出／備份／還原（superadmin） ---------- */
  @Get('export')
  async exportAll(@Req() req: AuthedRequest, @Res() res: Response, @Query('secrets') secrets?: string) {
    this.superOnly(req);
    const b = await this.exporter.exportAll({ includeSecrets: secrets === '1' });
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="sitekit-export-${b.generatedAt.slice(0, 19).replace(/[:T]/g, '-')}${b.includeSecrets ? '-full' : ''}.json"`);
    res.send(JSON.stringify(b));
  }

  @Post('import')
  importAll(@Req() req: AuthedRequest, @Body() body: { bundle?: unknown; confirm?: boolean }) {
    this.superOnly(req);
    return this.exporter.importAll(body?.bundle, { mode: 'replace', confirm: body?.confirm === true, actor: `admin:${req.session!.user.email}` });
  }

  @Get('backups')
  backups(@Req() req: AuthedRequest) {
    this.superOnly(req);
    return this.system.listBackups();
  }

  @Post('backups')
  backupNow(@Req() req: AuthedRequest) {
    this.superOnly(req);
    return this.system.backupNow(`admin:${req.session!.user.email}`);
  }

  @Get('backups/:name')
  download(@Req() req: AuthedRequest, @Param('name') name: string, @Res() res: Response) {
    this.superOnly(req);
    const file = this.system.backupPath(name);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename="${basename(file)}"`);
    res.send(readFileSync(file));
  }

  @Delete('backups/:name')
  remove(@Req() req: AuthedRequest, @Param('name') name: string) {
    this.superOnly(req);
    return this.system.deleteBackup(name);
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

@Module({ imports: [AdminAuthModule], controllers: [SetupController, SystemController], providers: [SystemService, ExportService], exports: [SystemService, ExportService] })
export class SystemModule implements OnModuleInit {
  constructor(private readonly system: SystemService) {}
  /** 啟動即補機密（在 listen 之前完成，OperatorTokenGuard 才讀得到自動產生的 OPS_TOKEN） */
  async onModuleInit() {
    await this.system.ensureSecrets();
    this.system.startBackupScheduler();
  }
}

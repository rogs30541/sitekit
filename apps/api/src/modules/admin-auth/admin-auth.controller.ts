import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { isProd } from '../../config/env';
import { AdminSessionGuard, type AuthedRequest } from '../../common/guards';
import { ADMIN_COOKIE, AdminAuthService, toPublicAdmin } from '@sitekit/core';

type CookieRequest = Request & { cookies?: Record<string, string> };

/** 後台登入：/api/admin/auth/*；cookie sk_admin 與前台 sk_session 互不相干。 */
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly admins: AdminAuthService) {}

  private async issue(adminId: string, req: Request, res: Response) {
    const s = await this.admins.createSession(adminId, req.headers['user-agent']);
    res.cookie(ADMIN_COOKIE, s.id, this.admins.cookieOptions());
  }

  /** 登入頁需要：是否尚未建立任何管理員（要走初始化） */
  @Get('status')
  async status() {
    return { needsBootstrap: (await this.admins.count()) === 0 };
  }

  /** 註冊管理員第 1 步：寄 Email 驗證碼（第一位管理員或白名單 email 才會寄；回應一律 ok 防列舉） */
  @Post('register/request')
  requestRegister(@Body() body: unknown) {
    return this.admins.requestRegister(body);
  }

  /** 註冊管理員第 2 步：驗證碼＋密碼 → 建立並登入 */
  @Post('register/confirm')
  async confirmRegister(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const admin = await this.admins.confirmRegister(body);
    await this.issue(admin.id, req, res);
    return { ok: true, admin };
  }

  @Post('login')
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const admin = await this.admins.login(body);
    await this.issue(admin.id, req, res);
    return { ok: true, admin: toPublicAdmin(admin) };
  }

  @Post('logout')
  async logout(@Req() req: CookieRequest, @Res({ passthrough: true }) res: Response) {
    await this.admins.destroy(req.cookies?.[ADMIN_COOKIE]);
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  async me(@Req() req: CookieRequest) {
    const s = await this.admins.resolve(req.cookies?.[ADMIN_COOKIE]);
    return s ? { authenticated: true, admin: toPublicAdmin(s.admin) } : { authenticated: false };
  }

  /** 開發用（非 production）：建立 dev 管理員並登入 */
  @Post('dev-login')
  async devLogin(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (isProd) throw new ForbiddenException('dev-login is development only');
    const admin = await this.admins.ensureDevAdmin();
    await this.issue(admin.id, req, res);
    return { ok: true, admin: toPublicAdmin(admin) };
  }
}

/** 管理員帳號管理：僅 superadmin */
@Controller('admin/auth/users')
@UseGuards(AdminSessionGuard)
export class AdminUsersController {
  constructor(private readonly admins: AdminAuthService) {}

  private assertSuper(req: AuthedRequest) {
    if (req.session!.user.role !== 'superadmin') throw new ForbiddenException('superadmin required');
  }

  @Get()
  list(@Req() req: AuthedRequest) {
    this.assertSuper(req);
    return this.admins.list();
  }

  @Post()
  create(@Body() body: unknown, @Req() req: AuthedRequest) {
    this.assertSuper(req);
    return this.admins.create(body);
  }

  @Patch(':idOrEmail')
  update(@Param('idOrEmail') idOrEmail: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    this.assertSuper(req);
    return this.admins.update(idOrEmail, body);
  }

  @Delete(':idOrEmail')
  remove(@Param('idOrEmail') idOrEmail: string, @Req() req: AuthedRequest) {
    this.assertSuper(req);
    if (idOrEmail === req.session!.user.id || idOrEmail === req.session!.user.email) throw new ForbiddenException('cannot delete yourself');
    return this.admins.remove(idOrEmail);
  }
}

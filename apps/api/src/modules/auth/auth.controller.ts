import { Body, Controller, ForbiddenException, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { isProd } from '../../config/env';
import { AuthService, toPublic } from './auth.service';
import { SESSION_COOKIE, SessionService } from './session.service';

type CookieRequest = Request & { cookies?: Record<string, string> };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  private async issue(userId: string, req: Request, res: Response) {
    const s = await this.sessions.create(userId, req.headers['user-agent']);
    res.cookie(SESSION_COOKIE, s.id, this.sessions.cookieOptions());
  }

  @Post('register')
  async register(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.register(body);
    await this.issue(user.id, req, res);
    return { ok: true, user };
  }

  @Post('login')
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.login(body);
    await this.issue(user.id, req, res);
    return { ok: true, user };
  }

  @Post('logout')
  async logout(@Req() req: CookieRequest, @Res({ passthrough: true }) res: Response) {
    await this.sessions.destroy(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  async me(@Req() req: CookieRequest) {
    const s = await this.sessions.resolve(req.cookies?.[SESSION_COOKIE]);
    return s ? { authenticated: true, user: toPublic(s.user) } : { authenticated: false };
  }

  /** 開發用登入：建立 dev 管理員並發 session。正式環境關閉。 */
  @Post('dev-login')
  async devLogin(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (isProd) throw new ForbiddenException('dev-login is development only');
    const user = await this.auth.ensureDevAdmin();
    await this.issue(user.id, req, res);
    return { ok: true, user };
  }
}

import { Body, Controller, Get, Post, Req, Res, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Role } from '@sitekit/shared';
import { env, isProd } from '../../config/env';
import { SESSION_COOKIE, decodeSession, encodeSession } from '../../common/session';

/** 骨架版認證：只提供開發用登入與 me。正式版接完整 Auth 模組（Email／LINE／Google）。 */
@Controller('auth')
export class AuthController {
  @Post('dev-login')
  devLogin(@Body() body: { userId?: string; role?: Role }, @Res({ passthrough: true }) res: Response) {
    if (isProd) throw new ForbiddenException('dev-login is development only');
    const payload = { userId: body.userId ?? 'dev-admin', role: body.role ?? 'admin', exp: Date.now() + 8 * 3600_000 };
    res.cookie(SESSION_COOKIE, encodeSession(payload), { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' });
    return { ok: true, session: payload, env: env.APP_ENV };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: Request & { cookies?: Record<string, string> }) {
    const s = decodeSession(req.cookies?.[SESSION_COOKIE]);
    return s ? { authenticated: true, ...s } : { authenticated: false };
  }
}

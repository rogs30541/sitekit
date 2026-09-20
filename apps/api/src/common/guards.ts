import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_ROLES } from '@sitekit/shared';
import { env } from '../config/env';
import { SESSION_COOKIE, SessionService, type ResolvedSession } from '../modules/auth/session.service';

type CookieRequest = Request & { cookies?: Record<string, string> };
export interface AuthedRequest extends Request {
  session?: ResolvedSession;
}

/** MCP 路徑：只認 Bearer OPS_TOKEN，不看 cookie。OPS_TOKEN 未設定＝整條路徑關閉。 */
@Injectable()
export class OperatorTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!env.OPS_TOKEN) throw new ForbiddenException('OPS_TOKEN not configured; MCP path is closed');
    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer ')) throw new UnauthorizedException('operator token missing');
    if (auth.slice(7) !== env.OPS_TOKEN) throw new UnauthorizedException('operator token invalid');
    return true;
  }
}

/** 任何已登入使用者（DB session）。 */
@Injectable()
export class UserSessionGuard implements CanActivate {
  constructor(protected readonly sessions: SessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest & CookieRequest>();
    const session = await this.sessions.resolve(req.cookies?.[SESSION_COOKIE]);
    if (!session) throw new UnauthorizedException('login required');
    req.session = session;
    return true;
  }
}

/** AI API 路徑與後台：只認 httpOnly cookie session、角色須為管理員，拒絕 Bearer token。 */
@Injectable()
export class AdminSessionGuard extends UserSessionGuard {
  override async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (req.headers.authorization) throw new ForbiddenException('this path accepts admin session only, not tokens');
    await super.canActivate(ctx);
    if (!ADMIN_ROLES.includes(req.session!.user.role)) throw new ForbiddenException('admin role required');
    return true;
  }
}

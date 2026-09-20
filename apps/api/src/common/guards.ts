import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_ROLES } from '@sitekit/shared';
import { env } from '../config/env';
import { SESSION_COOKIE, decodeSession, type SessionPayload } from './session';

type CookieRequest = Request & { cookies?: Record<string, string> };
export interface AuthedRequest extends Request { session?: SessionPayload }

/** MCP path: Bearer OPS_TOKEN only, cookies ignored. Unset OPS_TOKEN = whole path closed. */
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

/** AI API path: httpOnly cookie session only, admin role required, Bearer tokens rejected. */
@Injectable()
export class AdminSessionGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest & CookieRequest>();
    if (req.headers.authorization) throw new ForbiddenException('this path accepts admin session only, not tokens');
    const session = decodeSession(req.cookies?.[SESSION_COOKIE]);
    if (!session) throw new UnauthorizedException('admin login required');
    if (!ADMIN_ROLES.includes(session.role)) throw new ForbiddenException('admin role required');
    req.session = session;
    return true;
  }
}

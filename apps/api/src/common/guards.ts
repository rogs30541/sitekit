import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { ADMIN_ROLES } from '@sitekit/shared';
import { env } from '../config/env';
import { ADMIN_COOKIE, AdminAuthService } from '@sitekit/core';
import { SESSION_COOKIE, SessionService, type ResolvedSession } from '@sitekit/core';
import { env as coreEnv } from '@sitekit/core';

type CookieRequest = Request & { cookies?: Record<string, string> };
export interface AuthedRequest extends Request {
  /** 前台會員 session；後台路由則由 AdminSessionGuard 填入「形狀相容」的管理員資料（user.id／email／role 為管理員） */
  session?: ResolvedSession;
  /** 後台管理員（只有 AdminSessionGuard 會設） */
  adminId?: string;
}

/** MCP 路徑：只認 Bearer OPS_TOKEN，不看 cookie。OPS_TOKEN 未設定＝整條路徑關閉。 */
@Injectable()
export class OperatorTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!coreEnv.OPS_TOKEN) throw new ForbiddenException('OPS_TOKEN not configured; MCP path is closed');
    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer ')) throw new UnauthorizedException('operator token missing');
    if (auth.slice(7) !== coreEnv.OPS_TOKEN) throw new UnauthorizedException('operator token invalid');
    return true;
  }
}

/** 任何已登入的前台會員（DB session、cookie sk_session）。 */
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

/**
 * AI API 路徑與後台：只認後台管理員的 httpOnly cookie（sk_admin，admin_users 獨立帳號），拒絕 Bearer token 與前台會員 session。
 * 為了讓既有後台控制器沿用 req.session!.user.{id,email,role}，這裡填入形狀相容的物件。
 */
@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(private readonly admins: AdminAuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest & CookieRequest>();
    if (req.headers.authorization) throw new ForbiddenException('this path accepts admin session only, not tokens');
    const s = await this.admins.resolve(req.cookies?.[ADMIN_COOKIE]);
    if (!s) throw new UnauthorizedException('admin login required');
    if (!ADMIN_ROLES.includes(s.admin.role)) throw new ForbiddenException('admin role required');
    const user = { id: s.admin.id, email: s.admin.email, passwordHash: null, displayName: s.admin.displayName, role: s.admin.role, status: s.admin.status, membershipTier: null, allowedFeatures: [], creditBalance: 0, creditReserved: 0, createdAt: s.admin.createdAt, updatedAt: s.admin.updatedAt } as User;
    req.session = { id: s.id, userId: s.admin.id, expiresAt: s.expiresAt, userAgent: s.userAgent, createdAt: s.createdAt, user };
    req.adminId = s.admin.id;
    return true;
  }
}

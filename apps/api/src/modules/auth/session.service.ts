import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Session, User } from '@prisma/client';
import { isProd } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

export const SESSION_COOKIE = 'sk_session';
const TTL_MS = 30 * 24 * 3600_000;

export type ResolvedSession = Session & { user: User };

/** 伺服器端 session：cookie 只帶隨機 id，狀態與權限一律以 DB 為準。 */
@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, userAgent?: string): Promise<Session> {
    return this.prisma.session.create({
      data: { id: randomBytes(32).toString('base64url'), userId, userAgent: userAgent?.slice(0, 200), expiresAt: new Date(Date.now() + TTL_MS) },
    });
  }

  async resolve(sessionId?: string): Promise<ResolvedSession | null> {
    if (!sessionId) return null;
    const s = await this.prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
    if (!s || s.expiresAt < new Date() || s.user.status !== 'active') return null;
    return s;
  }

  async destroy(sessionId?: string): Promise<void> {
    if (!sessionId) return;
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  cookieOptions() {
    return { httpOnly: true, sameSite: 'lax' as const, secure: isProd, path: '/', maxAge: TTL_MS };
  }
}

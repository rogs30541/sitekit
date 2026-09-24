import { background } from '../../env';
import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '../../compat';
import { hashPassword, verifyPassword } from './password';
import { z } from 'zod';
import type { User } from '@prisma/client';
import { FEATURES } from '@sitekit/shared';
import { PrismaClient } from '@prisma/client';
import { NotifyService } from '../notify/notify.service';
import { events } from '../../plugins';

const credentials = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(60).optional(),
});

export type PublicUser = Omit<User, 'passwordHash'>;

export function toPublic(u: User): PublicUser {
  const { passwordHash: _omit, ...rest } = u;
  return rest;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notify: NotifyService,
  ) {}

  /** 前台會員註冊：一律 role=user（後台管理員走 admin_users，見 AdminAuthService）。 */
  async register(input: unknown): Promise<PublicUser> {
    const parsed = credentials.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const { email, password, displayName } = parsed.data;
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('email already registered');
    const user = await this.prisma.user.create({
      data: {
        email,
        displayName: displayName ?? email.split('@')[0],
        passwordHash: await hashPassword(password),
        role: 'user',
        allowedFeatures: [],
      },
    });
    background(this.notify.welcome(user.email, user.displayName));
    background(events.emit('user.registered', { id: user.id, email: user.email, displayName: user.displayName }));
    return toPublic(user);
  }

  async login(input: unknown): Promise<PublicUser> {
    const parsed = credentials.pick({ email: true, password: true }).safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const user = await this.prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      throw new UnauthorizedException('invalid email or password');
    }
    if (user.status !== 'active') throw new UnauthorizedException('account is not active');
    return toPublic(user);
  }

  /** 開發用：確保存在一個 dev 管理員帳號。 */
  async ensureDevAdmin(): Promise<PublicUser> {
    const user = await this.prisma.user.upsert({
      where: { email: 'dev-admin@local' },
      update: {},
      create: { email: 'dev-admin@local', displayName: 'Dev Member', role: 'user', allowedFeatures: [...FEATURES] },
    });
    return toPublic(user);
  }
}

import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { User } from '@prisma/client';
import { FEATURES } from '@sitekit/shared';
import { PrismaService } from '../../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  /** 第一位註冊者自動成為 superadmin（部署後的初始管理員 bootstrap）。 */
  async register(input: unknown): Promise<PublicUser> {
    const parsed = credentials.safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const { email, password, displayName } = parsed.data;
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('email already registered');
    const isFirst = (await this.prisma.user.count()) === 0;
    const user = await this.prisma.user.create({
      data: {
        email,
        displayName: displayName ?? email.split('@')[0],
        passwordHash: await bcrypt.hash(password, 10),
        role: isFirst ? 'superadmin' : 'user',
        allowedFeatures: isFirst ? [...FEATURES] : [],
      },
    });
    return toPublic(user);
  }

  async login(input: unknown): Promise<PublicUser> {
    const parsed = credentials.pick({ email: true, password: true }).safeParse(input);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten().fieldErrors);
    const user = await this.prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user?.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
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
      create: { email: 'dev-admin@local', displayName: 'Dev Admin', role: 'admin', allowedFeatures: [...FEATURES] },
    });
    return toPublic(user);
  }
}

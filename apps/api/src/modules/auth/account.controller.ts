import { BadRequestException, Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { isProd } from '../../config/env';
import { UserSessionGuard, type AuthedRequest } from '../../common/guards';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifyService } from '@sitekit/core';
import { SettingsService } from '@sitekit/core';
import { toPublic } from '@sitekit/core';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const RESET_TTL_MS = 3600_000;

/** 前台會員帳號：忘記密碼／重設、個人資料、變更密碼。 */
@Controller('auth')
export class AccountController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly settings: SettingsService,
  ) {}

  /** 忘記密碼：不論 email 是否存在都回 ok（防列舉）；非 production 回 devToken 供 E2E。 */
  @Post('forgot')
  async forgot(@Body() body: unknown) {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(body);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'active') return { ok: true };
    const raw = randomBytes(32).toString('hex');
    await this.prisma.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
    const site = await this.settings.siteUrl();
    const link = `${site}/reset-password?token=${raw}`;
    await this.notify.sendMail('password_reset', { to: user.email, subject: '【重設密碼】請在 1 小時內完成', html: `<p>${user.displayName ?? user.email} 您好，請點下方連結重設密碼（1 小時內有效）：</p><p><a href="${link}">${link}</a></p><p>若非您本人操作請忽略此信。</p>` }).catch(() => undefined);
    return { ok: true, ...(isProd ? {} : { devToken: raw }) };
  }

  @Post('reset')
  async reset(@Body() body: unknown) {
    const { token, password } = z.object({ token: z.string().min(20), password: z.string().min(8).max(200) }).parse(body);
    const row = await this.prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw new BadRequestException('重設連結無效或已過期');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await bcrypt.hash(password, 10) } }),
      this.prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.session.deleteMany({ where: { userId: row.userId } }),
    ]);
    return { ok: true };
  }

  @Patch('me')
  @UseGuards(UserSessionGuard)
  async updateMe(@Body() body: unknown, @Req() req: AuthedRequest) {
    const d = z.object({ displayName: z.string().trim().min(1).max(60) }).parse(body);
    const u = await this.prisma.user.update({ where: { id: req.session!.user.id }, data: { displayName: d.displayName } });
    return { ok: true, user: toPublic(u) };
  }

  @Post('change-password')
  @UseGuards(UserSessionGuard)
  async changePassword(@Body() body: unknown, @Req() req: AuthedRequest) {
    const d = z.object({ currentPassword: z.string().optional(), newPassword: z.string().min(8).max(200) }).parse(body);
    const u = await this.prisma.user.findUnique({ where: { id: req.session!.user.id } });
    if (!u) throw new BadRequestException('user not found');
    // 第三方登入建立的帳號可能沒有密碼：首次設定不需要舊密碼
    if (u.passwordHash && !(d.currentPassword && (await bcrypt.compare(d.currentPassword, u.passwordHash)))) throw new BadRequestException('目前密碼不正確');
    await this.prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(d.newPassword, 10) } });
    await this.prisma.session.deleteMany({ where: { userId: u.id, NOT: { id: req.session!.id } } });
    return { ok: true };
  }
}

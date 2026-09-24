import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '../../compat';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { hashPassword, verifyPassword } from '../auth/password';
import type { AdminSession, AdminUser } from '@prisma/client';
import { z } from 'zod';
import { isProd } from '../../env';
import { SETTING_KEYS } from '@sitekit/shared';
import { PrismaClient } from '@prisma/client';
import { NotifyService } from '../notify/notify.service';
import { SettingsService } from '../settings/settings.service';

export const ADMIN_COOKIE = 'sk_admin';
const TTL_MS = 12 * 3600_000; // 後台 session 12 小時

const credentials = z.object({ email: z.string().email().transform((s) => s.toLowerCase()), password: z.string().min(8).max(200), displayName: z.string().trim().max(60).optional() });
const createInput = credentials.extend({ role: z.enum(['admin', 'superadmin']).default('admin') });

export interface PublicAdmin {
  id: string;
  email: string;
  displayName: string | null;
  role: 'admin' | 'superadmin';
  lastLoginAt: Date | null;
  createdAt: Date;
}
export const toPublicAdmin = (a: AdminUser): PublicAdmin => ({ id: a.id, email: a.email, displayName: a.displayName, role: a.role as 'admin' | 'superadmin', lastLoginAt: a.lastLoginAt, createdAt: a.createdAt });
export type ResolvedAdminSession = AdminSession & { admin: AdminUser };

/**
 * 後台管理員帳號（admin_users）與 session（admin_sessions）：與前台會員完全分離。
 * 初始管理員：admin_users 為空時 `bootstrap()` 建立第一位 superadmin（之後關閉）；或 MCP 路徑 create_admin。
 */
@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly notify: NotifyService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * 後台註冊資格：admin_users 為空（第一位＝superadmin）或 email 在 `admin.registerAllowlist`
   *（逗號清單，可為完整 email 或 @網域）。不符資格一律不寄信、回相同訊息（防列舉）。
   */
  async registerEligibility(email: string): Promise<{ allowed: boolean; first: boolean }> {
    const first = (await this.count()) === 0;
    if (first) return { allowed: true, first: true };
    const raw = await this.settings.get(SETTING_KEYS.adminRegisterAllowlist, 'ADMIN_REGISTER_ALLOWLIST');
    const list = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const e = email.toLowerCase();
    const domain = e.slice(e.indexOf('@'));
    return { allowed: list.includes(e) || list.includes(domain), first: false };
  }

  /** 註冊第 1 步：寄 6 碼驗證碼（15 分鐘）。非 production 回 devCode 供 E2E。 */
  async requestRegister(input: unknown) {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(input);
    const elig = await this.registerEligibility(email);
    if (!elig.allowed) return { ok: true, sent: false as const };
    if (await this.prisma.adminUser.findUnique({ where: { email } })) throw new ConflictException('admin email already exists');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.adminVerification.deleteMany({ where: { email } });
    await this.prisma.adminVerification.create({ data: { email, codeHash: createHash('sha256').update(`${email}:${code}`).digest('hex'), expiresAt: new Date(Date.now() + 15 * 60_000) } });
    const site = await this.settings.siteUrl();
    await this.notify.sendMail('admin_register', { to: email, subject: '【後台管理員註冊】驗證碼', html: `<p>您的後台管理員註冊驗證碼：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>15 分鐘內有效。${elig.first ? '此帳號將成為第一位超級管理員。' : ''}</p><p><a href="${site}/admin/login">${site}/admin/login</a></p>` }).catch(() => undefined);
    return { ok: true, sent: true as const, first: elig.first, ...(isProd() ? {} : { devCode: code }) };
  }

  /** 註冊第 2 步：驗證碼＋密碼 → 建立管理員（第一位 superadmin，其餘 admin）。 */
  async confirmRegister(input: unknown): Promise<PublicAdmin> {
    const d = z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().regex(/^\d{6}$/), password: z.string().min(8).max(200), displayName: z.string().trim().max(60).optional() }).parse(input);
    const v = await this.prisma.adminVerification.findFirst({ where: { email: d.email }, orderBy: { createdAt: 'desc' } });
    if (!v || v.expiresAt < new Date()) throw new BadRequestException('驗證碼已過期，請重新申請');
    if (v.attempts >= 5) throw new BadRequestException('嘗試次數過多，請重新申請驗證碼');
    if (v.codeHash !== createHash('sha256').update(`${d.email}:${d.code}`).digest('hex')) {
      await this.prisma.adminVerification.update({ where: { id: v.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('驗證碼不正確');
    }
    const elig = await this.registerEligibility(d.email);
    if (!elig.allowed) throw new ForbiddenException('此 Email 不在管理員註冊白名單');
    await this.prisma.adminVerification.deleteMany({ where: { email: d.email } });
    return this.create({ email: d.email, password: d.password, displayName: d.displayName, role: elig.first ? 'superadmin' : 'admin' });
  }

  async count() {
    return this.prisma.adminUser.count();
  }

  async bootstrap(input: unknown): Promise<PublicAdmin> {
    if ((await this.count()) > 0) throw new ForbiddenException('admin already initialized');
    return this.create({ ...(input as object), role: 'superadmin' });
  }

  async create(input: unknown): Promise<PublicAdmin> {
    const r = createInput.safeParse(input);
    if (!r.success) throw new BadRequestException(r.error.flatten().fieldErrors);
    if (await this.prisma.adminUser.findUnique({ where: { email: r.data.email } })) throw new ConflictException('admin email already exists');
    const a = await this.prisma.adminUser.create({ data: { email: r.data.email, passwordHash: await hashPassword(r.data.password), displayName: r.data.displayName ?? r.data.email.split('@')[0], role: r.data.role } });
    return toPublicAdmin(a);
  }

  list() {
    return this.prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } }).then((rows) => rows.map(toPublicAdmin));
  }

  async update(idOrEmail: string, input: unknown) {
    const a = await this.find(idOrEmail);
    const d = z.object({ password: z.string().min(8).max(200).optional(), displayName: z.string().trim().max(60).optional(), role: z.enum(['admin', 'superadmin']).optional(), status: z.enum(['active', 'suspended']).optional() }).parse(input);
    if (d.role && d.role !== 'superadmin' && a.role === 'superadmin' && (await this.prisma.adminUser.count({ where: { role: 'superadmin', status: 'active' } })) <= 1) throw new BadRequestException('cannot demote the last superadmin');
    const u = await this.prisma.adminUser.update({ where: { id: a.id }, data: { ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}), displayName: d.displayName, role: d.role, status: d.status } });
    if (d.password || d.status === 'suspended') await this.prisma.adminSession.deleteMany({ where: { adminId: a.id } });
    return toPublicAdmin(u);
  }

  async remove(idOrEmail: string) {
    const a = await this.find(idOrEmail);
    if (a.role === 'superadmin' && (await this.prisma.adminUser.count({ where: { role: 'superadmin', status: 'active' } })) <= 1) throw new BadRequestException('cannot delete the last superadmin');
    await this.prisma.adminUser.delete({ where: { id: a.id } });
    return { deleted: a.email };
  }

  async find(idOrEmail: string) {
    const a = await this.prisma.adminUser.findFirst({ where: { OR: [{ id: idOrEmail }, { email: idOrEmail.toLowerCase() }] } });
    if (!a) throw new NotFoundException('admin not found');
    return a;
  }

  async login(input: unknown): Promise<AdminUser> {
    const r = credentials.pick({ email: true, password: true }).safeParse(input);
    if (!r.success) throw new BadRequestException(r.error.flatten().fieldErrors);
    const a = await this.prisma.adminUser.findUnique({ where: { email: r.data.email } });
    if (!a || !(await verifyPassword(r.data.password, a.passwordHash))) throw new UnauthorizedException('invalid email or password');
    if (a.status !== 'active') throw new UnauthorizedException('admin account is not active');
    return this.prisma.adminUser.update({ where: { id: a.id }, data: { lastLoginAt: new Date() } });
  }

  /** 開發用：確保有 dev 管理員（非 production）。 */
  async ensureDevAdmin(): Promise<AdminUser> {
    if (isProd()) throw new ForbiddenException('development only');
    return this.prisma.adminUser.upsert({ where: { email: 'dev-admin@local' }, update: {}, create: { email: 'dev-admin@local', passwordHash: await hashPassword(randomBytes(16).toString('hex')), displayName: 'Dev Admin', role: 'superadmin' } });
  }

  // ---- session ----
  async createSession(adminId: string, userAgent?: string) {
    return this.prisma.adminSession.create({ data: { id: randomBytes(32).toString('base64url'), adminId, userAgent: userAgent?.slice(0, 200), expiresAt: new Date(Date.now() + TTL_MS) } });
  }

  async resolve(sessionId?: string): Promise<ResolvedAdminSession | null> {
    if (!sessionId) return null;
    const s = await this.prisma.adminSession.findUnique({ where: { id: sessionId }, include: { admin: true } });
    if (!s || s.expiresAt < new Date() || s.admin.status !== 'active') return null;
    return s;
  }

  async destroy(sessionId?: string) {
    if (sessionId) await this.prisma.adminSession.deleteMany({ where: { id: sessionId } });
  }

  cookieOptions() {
    return { httpOnly: true, sameSite: 'strict' as const, secure: isProd(), path: '/', maxAge: TTL_MS };
  }
}

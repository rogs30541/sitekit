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
    const primary = (await this.primaryEmail()).toLowerCase();
    return { allowed: list.includes(e) || list.includes(domain) || (!!primary && primary === e), first: false };
  }

  /* ---------- 主管理員 Email（第一個輸入的 Email 為主） ---------- */
  /** 第一位管理員建立時輸入的 Email；永久具備註冊／收驗證碼資格，站主通知信箱預設也是它 */
  async primaryEmail(): Promise<string> {
    return (await this.settings.get(SETTING_KEYS.adminPrimaryEmail, 'SITEKIT_ADMIN_EMAIL')).trim().toLowerCase();
  }
  /** 設定主管理員 Email；mail.adminTo 為空或等於舊值時一併改，讓通知信跟著走 */
  async setPrimaryEmail(email: string, previous?: string) {
    const e = email.trim().toLowerCase();
    await this.prisma.setting.upsert({ where: { key: SETTING_KEYS.adminPrimaryEmail }, update: { value: e }, create: { key: SETTING_KEYS.adminPrimaryEmail, value: e, isSecret: false } });
    const adminTo = (await this.settings.get(SETTING_KEYS.mailAdminTo, 'MAIL_ADMIN_TO')).trim().toLowerCase();
    if (!adminTo || (previous && adminTo === previous.toLowerCase())) await this.prisma.setting.upsert({ where: { key: SETTING_KEYS.mailAdminTo }, update: { value: e }, create: { key: SETTING_KEYS.mailAdminTo, value: e, isSecret: false } });
    this.settings.invalidate();
    return e;
  }
  /** 換 Email（本人：要現在的密碼；superadmin 管理他人：不用）。主管理員 Email／mail.adminTo 若等於舊值會跟著改。 */
  async changeEmail(idOrEmail: string, newEmail: string, opts: { currentPassword?: string; requirePassword?: boolean } = {}) {
    const a = await this.find(idOrEmail);
    const email = z.string().trim().toLowerCase().email().parse(newEmail);
    if (opts.requirePassword) {
      if (!opts.currentPassword || !(await verifyPassword(opts.currentPassword, a.passwordHash))) throw new UnauthorizedException('目前密碼不正確');
    }
    if (email === a.email) return toPublicAdmin(a);
    if (await this.prisma.adminUser.findUnique({ where: { email } })) throw new ConflictException('此 Email 已被另一位管理員使用');
    const u = await this.prisma.adminUser.update({ where: { id: a.id }, data: { email } });
    if ((await this.primaryEmail()) === a.email || a.role === 'superadmin') await this.setPrimaryEmail(email, a.email);
    await this.prisma.adminVerification.deleteMany({ where: { email: a.email } });
    return toPublicAdmin(u);
  }
  /**
   * 救援（不需登入、不需收信）：環境變數 SITEKIT_ADMIN_EMAIL／SITEKIT_ADMIN_PASSWORD 或 CLI `sitekit admin set-email|reset-password`。
   * - 沒有任何管理員：兩者都給才建立第一位 superadmin（只給 Email＝設成主管理員 Email，之後到 /setup 或註冊頁用它建立）。
   * - 已有管理員但沒有此 Email：把第一位 superadmin 的 Email 改成它（填錯 Email 的救援）。
   * - 有給密碼：重設該帳號密碼並清掉所有 session。
   * 用完請把環境變數移除（每次啟動都會套用）。
   */
  async rescue(input: { email?: string; password?: string; mode?: 'set-email' | 'reset-password' }): Promise<{ applied: string[]; email?: string }> {
    const applied: string[] = [];
    const email = String(input.email ?? '').trim().toLowerCase();
    const password = String(input.password ?? '');
    if (!email && !password) return { applied };
    if (email && !z.string().email().safeParse(email).success) throw new BadRequestException('SITEKIT_ADMIN_EMAIL 不是合法 Email');
    if (password && password.length < 8) throw new BadRequestException('SITEKIT_ADMIN_PASSWORD 至少 8 碼');
    const total = await this.count();
    let target: AdminUser | null = null;
    if (total === 0) {
      if (email && password) {
        target = await this.prisma.adminUser.create({ data: { email, passwordHash: await hashPassword(password), displayName: email.split('@')[0], role: 'superadmin' } });
        applied.push('created-superadmin');
      } else if (email) {
        await this.setPrimaryEmail(email);
        applied.push('primary-email');
        return { applied, email };
      } else return { applied };
    } else if (email) {
      target = await this.prisma.adminUser.findUnique({ where: { email } });
      if (!target && input.mode === 'reset-password') throw new NotFoundException(`找不到管理員 ${email}（要改 Email 請用 set-email）`);
      if (!target) {
        const first = (await this.prisma.adminUser.findFirst({ where: { role: 'superadmin' }, orderBy: { createdAt: 'asc' } })) ?? (await this.prisma.adminUser.findFirst({ orderBy: { createdAt: 'asc' } }))!;
        target = await this.prisma.adminUser.update({ where: { id: first.id }, data: { email, status: 'active' } });
        await this.prisma.adminVerification.deleteMany({ where: { email: first.email } });
        applied.push(`email:${first.email}->${email}`);
      }
    } else {
      target = (await this.prisma.adminUser.findFirst({ where: { role: 'superadmin' }, orderBy: { createdAt: 'asc' } })) ?? (await this.prisma.adminUser.findFirst({ orderBy: { createdAt: 'asc' } }))!;
    }
    if (email) await this.setPrimaryEmail(email, (await this.primaryEmail()) || undefined);
    if (password && target) {
      await this.prisma.adminUser.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(password), status: 'active' } });
      await this.prisma.adminSession.deleteMany({ where: { adminId: target.id } });
      applied.push('password');
    }
    return { applied, email: target?.email ?? email };
  }
  /** 啟動時套用環境變數救援（Node 殼呼叫；Workers 無 process.env 不會跑） */
  async applyEnvRescue(log?: (msg: string) => void) {
    const env = typeof process !== 'undefined' ? process.env : ({} as Record<string, string | undefined>);
    if (!env.SITEKIT_ADMIN_EMAIL && !env.SITEKIT_ADMIN_PASSWORD) return null;
    const r = await this.rescue({ email: env.SITEKIT_ADMIN_EMAIL, password: env.SITEKIT_ADMIN_PASSWORD, mode: 'set-email' });
    log?.(`SITEKIT_ADMIN_EMAIL／PASSWORD 已套用：${r.applied.join('、') || '（無變更）'}${r.email ? `（${r.email}）` : ''}——完成登入後請移除這兩個環境變數`);
    return r;
  }

  /** 註冊第 1 步：寄 6 碼驗證碼（15 分鐘）。非 production 回 devCode 供 E2E。 */
  async requestRegister(input: unknown) {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(input);
    const elig = await this.registerEligibility(email);
    if (!elig.allowed) return { ok: true, sent: false as const };
    if (await this.prisma.adminUser.findUnique({ where: { email } })) throw new ConflictException('此 Email 已是管理員：請直接登入；忘記密碼請用登入頁的「忘記密碼」');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.adminVerification.deleteMany({ where: { email } });
    await this.prisma.adminVerification.create({ data: { email, codeHash: createHash('sha256').update(`${email}:${code}`).digest('hex'), expiresAt: new Date(Date.now() + 15 * 60_000) } });
    const site = await this.settings.siteUrl();
    const mail = await this.notify.sendKind('admin_register', email, { email, code, firstNote: elig.first ? '<strong>此帳號將成為第一位超級管理員。</strong>' : '', loginUrl: `${site}/admin/login` }).catch(() => undefined);
    return { ok: true, sent: true as const, first: elig.first, mail: mail ? { ok: mail.ok, provider: mail.provider, error: mail.error } : undefined, ...(isProd() ? {} : { devCode: code }) };
  }

  /* ---------- 忘記密碼（既有管理員；回應一律 ok 防列舉） ---------- */
  async forgotPassword(input: unknown) {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(input);
    const a = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!a || a.status !== 'active') return { ok: true, sent: false as const };
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.adminVerification.deleteMany({ where: { email } });
    await this.prisma.adminVerification.create({ data: { email, codeHash: createHash('sha256').update(`reset:${email}:${code}`).digest('hex'), expiresAt: new Date(Date.now() + 15 * 60_000) } });
    const site = await this.settings.siteUrl();
    const mail = await this.notify.sendKind('admin_password_reset', email, { email, code, resetUrl: `${site}/admin/login?mode=forgot` }).catch(() => undefined);
    return { ok: true, sent: true as const, mail: mail ? { ok: mail.ok, provider: mail.provider, error: mail.error } : undefined, ...(isProd() ? {} : { devCode: code }) };
  }
  async resetPassword(input: unknown): Promise<PublicAdmin> {
    const d = z.object({ email: z.string().trim().toLowerCase().email(), code: z.string().regex(/^\d{6}$/), password: z.string().min(8).max(200) }).parse(input);
    const a = await this.prisma.adminUser.findUnique({ where: { email: d.email } });
    const v = await this.prisma.adminVerification.findFirst({ where: { email: d.email }, orderBy: { createdAt: 'desc' } });
    if (!a || !v || v.expiresAt < new Date()) throw new BadRequestException('驗證碼已過期，請重新申請');
    if (v.attempts >= 5) throw new BadRequestException('嘗試次數過多，請重新申請驗證碼');
    if (v.codeHash !== createHash('sha256').update(`reset:${d.email}:${d.code}`).digest('hex')) {
      await this.prisma.adminVerification.update({ where: { id: v.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('驗證碼不正確');
    }
    const u = await this.prisma.adminUser.update({ where: { id: a.id }, data: { passwordHash: await hashPassword(d.password), status: 'active' } });
    await this.prisma.adminVerification.deleteMany({ where: { email: d.email } });
    await this.prisma.adminSession.deleteMany({ where: { adminId: a.id } });
    return toPublicAdmin(u);
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
    const created = await this.create({ email: d.email, password: d.password, displayName: d.displayName, role: elig.first ? 'superadmin' : 'admin' });
    if (elig.first) await this.setPrimaryEmail(created.email);
    return created;
  }

  async count() {
    return this.prisma.adminUser.count();
  }

  async bootstrap(input: unknown): Promise<PublicAdmin> {
    if ((await this.count()) > 0) throw new ForbiddenException('admin already initialized');
    const a = await this.create({ ...(input as object), role: 'superadmin' });
    await this.setPrimaryEmail(a.email);
    return a;
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
    const d = z.object({ email: z.string().trim().toLowerCase().email().optional(), password: z.string().min(8).max(200).optional(), displayName: z.string().trim().max(60).optional(), role: z.enum(['admin', 'superadmin']).optional(), status: z.enum(['active', 'suspended']).optional() }).parse(input);
    if (d.email && d.email !== a.email) await this.changeEmail(a.id, d.email);
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

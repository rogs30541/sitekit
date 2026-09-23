import { BadRequestException, Controller, Get, Param, Query, Req, Res } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { SETTING_KEYS } from '@sitekit/shared';
import { isProd } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifyService } from '@sitekit/core';
import { SettingsService } from '@sitekit/core';
import { SESSION_COOKIE, SessionService } from '@sitekit/core';

type CookieRequest = Request & { cookies?: Record<string, string> };
const STATE_COOKIE = 'sk_oauth';
const PROVIDERS = ['google', 'line', 'mock'] as const;
type Provider = (typeof PROVIDERS)[number];

interface Profile {
  sub: string;
  email: string | null;
  name: string | null;
}

/**
 * 第三方登入（Google／LINE Login，OAuth 2.0 授權碼）：同一個人用不同管道登入合併為單一會員——
 * 先以 identities(provider, sub) 找；找不到再以 email 併入既有會員；都沒有才建新會員。
 * mock provider 只在非 production 開放，供 E2E。設定：google.clientId/clientSecret、line.loginChannelId/loginChannelSecret。
 */
@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly sessions: SessionService,
    private readonly notify: NotifyService,
  ) {}

  private async cfg(provider: Provider) {
    if (provider === 'google') {
      const [id, secret] = await Promise.all([this.settings.get(SETTING_KEYS.googleClientId, 'GOOGLE_CLIENT_ID'), this.settings.get(SETTING_KEYS.googleClientSecret, 'GOOGLE_CLIENT_SECRET')]);
      return { id, secret, configured: !!(id && secret) };
    }
    if (provider === 'line') {
      const [id, secret] = await Promise.all([this.settings.get(SETTING_KEYS.lineLoginChannelId, 'LINE_LOGIN_CHANNEL_ID'), this.settings.get(SETTING_KEYS.lineLoginChannelSecret, 'LINE_LOGIN_CHANNEL_SECRET')]);
      return { id, secret, configured: !!(id && secret) };
    }
    return { id: 'mock', secret: 'mock', configured: !isProd };
  }

  private async redirectUri(provider: Provider) {
    return `${await this.settings.siteUrl()}/api/auth/oauth/${provider}/callback`;
  }

  /** 登入頁按鈕用：已設定的供應商 */
  @Get('providers')
  async providers() {
    const out: { id: Provider; label: string }[] = [];
    for (const p of PROVIDERS) {
      if ((await this.cfg(p)).configured) out.push({ id: p, label: p === 'google' ? 'Google' : p === 'line' ? 'LINE' : 'Mock（測試）' });
    }
    return out;
  }

  @Get(':provider/start')
  async start(@Param('provider') providerRaw: string, @Query('next') next: string | undefined, @Query() q: Record<string, string>, @Res() res: Response) {
    const provider = this.parse(providerRaw);
    const c = await this.cfg(provider);
    if (!c.configured) throw new BadRequestException(`${provider} login is not configured`);
    const state = randomBytes(16).toString('hex');
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/member';
    res.cookie(STATE_COOKIE, `${state}:${encodeURIComponent(safeNext)}`, { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/', maxAge: 10 * 60_000 });
    const redirectUri = await this.redirectUri(provider);
    if (provider === 'google') {
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      u.search = new URLSearchParams({ client_id: c.id, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' }).toString();
      return res.redirect(302, u.toString());
    }
    if (provider === 'line') {
      const u = new URL('https://access.line.me/oauth2/v2.1/authorize');
      u.search = new URLSearchParams({ response_type: 'code', client_id: c.id, redirect_uri: redirectUri, state, scope: 'profile openid email' }).toString();
      return res.redirect(302, u.toString());
    }
    // mock：把 query 的假 profile 編成 code，直接導回 callback
    const profile: Profile = { sub: q.sub || `mock-${Date.now()}`, email: q.email || null, name: q.name || null };
    const code = Buffer.from(JSON.stringify(profile)).toString('base64url');
    return res.redirect(302, `${redirectUri}?code=${code}&state=${state}`);
  }

  @Get(':provider/callback')
  async callback(@Param('provider') providerRaw: string, @Query('code') code: string | undefined, @Query('state') state: string | undefined, @Query('error') error: string | undefined, @Req() req: CookieRequest, @Res() res: Response) {
    const provider = this.parse(providerRaw);
    const site = await this.settings.siteUrl();
    const raw = req.cookies?.[STATE_COOKIE] ?? '';
    const [expectState, nextEnc] = raw.split(':');
    const next = nextEnc ? decodeURIComponent(nextEnc) : '/member';
    res.clearCookie(STATE_COOKIE, { path: '/' });
    if (error || !code || !state || state !== expectState) return res.redirect(302, `${site}/login?oauth=failed`);
    let profile: Profile;
    try {
      profile = await this.exchange(provider, code);
    } catch (e) {
      return res.redirect(302, `${site}/login?oauth=failed&reason=${encodeURIComponent(e instanceof Error ? e.message : 'exchange')}`);
    }
    const user = await this.upsertUser(provider, profile);
    if (user.status !== 'active') return res.redirect(302, `${site}/login?oauth=suspended`);
    const s = await this.sessions.create(user.id, req.headers['user-agent']);
    res.cookie(SESSION_COOKIE, s.id, this.sessions.cookieOptions());
    return res.redirect(302, `${site}${next}`);
  }

  private parse(p: string): Provider {
    if (!(PROVIDERS as readonly string[]).includes(p)) throw new BadRequestException('unknown provider');
    return p as Provider;
  }

  private async exchange(provider: Provider, code: string): Promise<Profile> {
    const c = await this.cfg(provider);
    const redirectUri = await this.redirectUri(provider);
    if (provider === 'mock') {
      if (isProd) throw new Error('mock disabled');
      return JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as Profile;
    }
    if (provider === 'google') {
      const tok = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
      const t = (await tok.json()) as { access_token?: string; error?: string; error_description?: string };
      if (!t.access_token) throw new Error(`google token: ${t.error ?? tok.status} ${t.error_description ?? ''}`.trim());
      const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${t.access_token}` } });
      const u = (await info.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string };
      if (!u.sub) throw new Error('google userinfo failed');
      return { sub: u.sub, email: u.email && u.email_verified !== false ? u.email.toLowerCase() : null, name: u.name ?? null };
    }
    const tok = await fetch('https://api.line.me/oauth2/v2.1/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: c.id, client_secret: c.secret }) });
    const t = (await tok.json()) as { id_token?: string; access_token?: string; error?: string; error_description?: string };
    if (!t.id_token) throw new Error(`line token: ${t.error ?? tok.status} ${t.error_description ?? ''}`.trim());
    // 用 LINE 的 verify 端點驗 id_token（不自行解 JWT）
    const ver = await fetch('https://api.line.me/oauth2/v2.1/verify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ id_token: t.id_token, client_id: c.id }) });
    const p = (await ver.json()) as { sub?: string; email?: string; name?: string; error?: string };
    if (!p.sub) throw new Error(`line verify: ${p.error ?? ver.status}`);
    return { sub: p.sub, email: p.email?.toLowerCase() ?? null, name: p.name ?? null };
  }

  /** identities 命中 → 該會員；否則以 email 併入既有會員（並綁 identity）；否則建新會員（無 email 用替代信箱）。 */
  private async upsertUser(provider: Provider, profile: Profile) {
    const ident = await this.prisma.identity.findUnique({ where: { provider_providerUid: { provider, providerUid: profile.sub } }, include: { user: true } });
    if (ident) return ident.user;
    let user = profile.email ? await this.prisma.user.findUnique({ where: { email: profile.email } }) : null;
    if (!user) {
      const email = profile.email ?? `${provider}_${createHash('sha1').update(profile.sub).digest('hex').slice(0, 12)}@noemail.local`;
      user = await this.prisma.user.create({ data: { email, displayName: profile.name ?? email.split('@')[0], role: 'user' } });
      this.notify.welcome(user.email, user.displayName).catch(() => undefined);
    }
    await this.prisma.identity.create({ data: { userId: user.id, provider, providerUid: profile.sub } });
    return user;
  }
}

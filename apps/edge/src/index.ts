/**
 * SiteKit edge：Cloudflare Workers + D1 + Resend 的對照實作（Hono + Drizzle）。
 * 與 apps/api 相同的核心規則：DB session cookie、首位註冊者＝superadmin、
 * 後台雙路徑（MCP：Bearer OPS_TOKEN → /api/ops/*；AI API：admin session → /api/admin/ai/*）收斂到同一個 runOps。
 */
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { drizzle } from 'drizzle-orm/d1';
import { and, desc, eq, sql } from 'drizzle-orm';
import { auditLogs, contents, emailLogs, sessions, settings, users } from './db/schema';
import { sendEmail } from './lib/email';
import { hashPassword, verifyPassword } from './lib/password';

type Bindings = {
  DB: D1Database;
  APP_ENV: string;
  FRONTEND_URL: string;
  SESSION_SECRET: string;
  OPS_TOKEN?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
};
type User = typeof users.$inferSelect;
type Variables = { user?: User; sessionId?: string };

const SESSION_COOKIE = 'sk_session';
const TTL_MS = 30 * 24 * 3600_000;
const ADMIN_ROLES = ['admin', 'superadmin'];
const SECRET_KEY = /secret|key|token|password|hashiv|signing/i;

const OPS_ACTIONS = {
  status: { desc: '讀取系統狀態', mutating: false },
  get_settings: { desc: '讀取系統設定（機密遮蔽）', mutating: false },
  update_settings: { desc: '更新系統設定', mutating: true },
  email_test: { desc: '透過 Resend 寄測試信', mutating: true },
  audit: { desc: '讀取稽核日誌', mutating: false },
} as const;
type OpsAction = keyof typeof OPS_ACTIONS;

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>().basePath('/api');

const pub = (u: User) => ({ id: u.id, email: u.email, displayName: u.displayName, role: u.role, status: u.status, createdAt: u.createdAt });

// ---------- session ----------
async function resolveSession(c: { env: Bindings; req: { raw: Request } }, cookie?: string) {
  if (!cookie) return null;
  const db = drizzle(c.env.DB);
  const rows = await db.select({ s: sessions, u: users }).from(sessions).innerJoin(users, eq(users.id, sessions.userId)).where(eq(sessions.id, cookie)).limit(1);
  const row = rows[0];
  if (!row || row.s.expiresAt < Date.now() || row.u.status !== 'active') return null;
  return row;
}

async function issueSession(c: { env: Bindings }, userId: string) {
  const id = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  await drizzle(c.env.DB).insert(sessions).values({ id, userId, expiresAt: Date.now() + TTL_MS, createdAt: Date.now() });
  return id;
}

const userGuard = async (c: any, next: () => Promise<void>) => {
  const row = await resolveSession(c, getCookie(c, SESSION_COOKIE));
  if (!row) return c.json({ message: 'login required', statusCode: 401 }, 401);
  c.set('user', row.u);
  c.set('sessionId', row.s.id);
  await next();
};

/** AI API 路徑守衛：只認 session、拒絕 Bearer、角色須為管理員 */
const adminGuard = async (c: any, next: () => Promise<void>) => {
  if (c.req.header('authorization')) return c.json({ message: 'this path accepts admin session only, not tokens', statusCode: 403 }, 403);
  const row = await resolveSession(c, getCookie(c, SESSION_COOKIE));
  if (!row) return c.json({ message: 'admin login required', statusCode: 401 }, 401);
  if (!ADMIN_ROLES.includes(row.u.role)) return c.json({ message: 'admin role required', statusCode: 403 }, 403);
  c.set('user', row.u);
  await next();
};

/** MCP 路徑守衛：只認 Bearer OPS_TOKEN；未設定＝整條關閉 */
const opsGuard = async (c: any, next: () => Promise<void>) => {
  if (!c.env.OPS_TOKEN) return c.json({ message: 'OPS_TOKEN not configured; MCP path is closed', statusCode: 403 }, 403);
  const auth = c.req.header('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return c.json({ message: 'operator token missing', statusCode: 401 }, 401);
  if (auth.slice(7) !== c.env.OPS_TOKEN) return c.json({ message: 'operator token invalid', statusCode: 401 }, 401);
  await next();
};

// ---------- ops（雙路徑共用） ----------
async function runOps(env: Bindings, cf: IncomingRequestCfProperties | undefined, action: string, params: Record<string, unknown>, actor: string) {
  const db = drizzle(env.DB);
  const at = new Date().toISOString();
  if (!(action in OPS_ACTIONS)) return { ok: false, action, actor, at, error: 'unknown action: ' + action };
  const a = action as OpsAction;
  try {
    let data: unknown;
    switch (a) {
      case 'status': {
        const [[u], [pc], [al]] = await Promise.all([
          db.select({ n: sql<number>`count(*)` }).from(users),
          db.select({ n: sql<number>`count(*)` }).from(contents).where(eq(contents.status, 'published')),
          db.select({ n: sql<number>`count(*)` }).from(auditLogs),
        ]);
        data = { env: env.APP_ENV, platform: 'cloudflare-workers', colo: cf?.colo ?? null, country: cf?.country ?? null, counts: { users: u.n, publishedContents: pc.n, auditLogs: al.n }, services: { db: 'd1', email: env.RESEND_API_KEY ? 'resend' : 'resend(dry-run)' } };
        break;
      }
      case 'get_settings': {
        const rows = await db.select().from(settings).orderBy(settings.key);
        data = Object.fromEntries(rows.map((r) => [r.key, r.isSecret ? '****' : r.value]));
        break;
      }
      case 'update_settings': {
        const entries = Object.entries((params.settings as Record<string, unknown>) ?? {});
        if (!entries.length) throw new Error('settings must not be empty');
        for (const [key, v] of entries) {
          await db.insert(settings).values({ key, value: String(v), isSecret: SECRET_KEY.test(key) ? 1 : 0, updatedAt: Date.now() }).onConflictDoUpdate({ target: settings.key, set: { value: String(v), updatedAt: Date.now() } });
        }
        data = { updated: entries.map(([k]) => k) };
        break;
      }
      case 'email_test': {
        const to = String(params.to ?? '');
        if (!/^[^@\s]+@[^@\s]+$/.test(to)) throw new Error('params.to must be an email');
        data = await sendEmail(env, to, String(params.subject ?? 'SiteKit edge 測試信'), String(params.html ?? '<p>這是一封來自 Cloudflare Workers + Resend 的測試信。</p>'));
        break;
      }
      case 'audit': {
        data = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(Math.min(Number(params.limit ?? 50), 200));
        break;
      }
    }
    if (OPS_ACTIONS[a].mutating) {
      const safe = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, k === 'settings' && v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).map((kk) => [kk, SECRET_KEY.test(kk) ? '****' : (v as Record<string, unknown>)[kk]])) : v]));
      await db.insert(auditLogs).values({ id: crypto.randomUUID(), actor, action: a, ok: 1, params: JSON.stringify(safe), result: JSON.stringify(data ?? null), createdAt: Date.now() });
    }
    return { ok: true, action: a, actor, at, data };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.insert(auditLogs).values({ id: crypto.randomUUID(), actor, action: a, ok: 0, error, params: JSON.stringify(params), createdAt: Date.now() });
    return { ok: false, action: a, actor, at, error };
  }
}

// ---------- routes ----------
app.get('/health', (c) => c.json({ ok: true, service: 'sitekit-edge', platform: 'cloudflare-workers', version: '0.1.0', env: c.env.APP_ENV, colo: c.req.raw.cf?.colo ?? null, at: new Date().toISOString() }));

app.post('/auth/register', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string; displayName?: string }>().catch(() => ({}) as Record<string, string>);
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!/^[^@\s]+@[^@\s]+$/.test(email) || password.length < 8) return c.json({ message: 'invalid email or password (min 8)', statusCode: 400 }, 400);
  const db = drizzle(c.env.DB);
  if ((await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)).length) return c.json({ message: 'email already registered', statusCode: 409 }, 409);
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(users);
  const user: User = { id: crypto.randomUUID(), email, passwordHash: await hashPassword(password), displayName: body.displayName?.trim() || email.split('@')[0], role: Number(n) === 0 ? 'superadmin' : 'user', status: 'active', createdAt: Date.now() };
  await db.insert(users).values(user);
  const sid = await issueSession(c, user.id);
  setCookie(c, SESSION_COOKIE, sid, { httpOnly: true, sameSite: 'Lax', secure: c.env.APP_ENV === 'production', path: '/', maxAge: TTL_MS / 1000 });
  return c.json({ ok: true, user: pub(user) }, 201);
});

app.post('/auth/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => ({}) as Record<string, string>);
  const email = String(body.email ?? '').trim().toLowerCase();
  const db = drizzle(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || !(await verifyPassword(String(body.password ?? ''), user.passwordHash))) return c.json({ message: 'invalid email or password', statusCode: 401 }, 401);
  if (user.status !== 'active') return c.json({ message: 'account is not active', statusCode: 401 }, 401);
  const sid = await issueSession(c, user.id);
  setCookie(c, SESSION_COOKIE, sid, { httpOnly: true, sameSite: 'Lax', secure: c.env.APP_ENV === 'production', path: '/', maxAge: TTL_MS / 1000 });
  return c.json({ ok: true, user: pub(user) }, 201);
});

app.post('/auth/logout', async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) await drizzle(c.env.DB).delete(sessions).where(eq(sessions.id, sid));
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ ok: true });
});

app.get('/auth/me', async (c) => {
  const row = await resolveSession(c, getCookie(c, SESSION_COOKIE));
  return c.json(row ? { authenticated: true, user: pub(row.u) } : { authenticated: false });
});

app.get('/content/posts', async (c) => {
  const db = drizzle(c.env.DB);
  const items = await db.select({ slug: contents.slug, title: contents.title, excerpt: contents.excerpt, publishedAt: contents.publishedAt }).from(contents).where(eq(contents.status, 'published')).orderBy(desc(contents.publishedAt)).limit(20);
  return c.json({ items, total: items.length });
});

app.get('/content/posts/:slug', async (c) => {
  const [item] = await drizzle(c.env.DB).select().from(contents).where(and(eq(contents.slug, c.req.param('slug')), eq(contents.status, 'published'))).limit(1);
  return item ? c.json(item) : c.json({ message: 'post not found', statusCode: 404 }, 404);
});

// MCP 路徑
app.get('/ops/actions', opsGuard, (c) => c.json(Object.entries(OPS_ACTIONS).map(([action, v]) => ({ action, ...v }))));
app.post('/ops/run', opsGuard, async (c) => {
  const body = await c.req.json<{ action: string; params?: Record<string, unknown> }>();
  return c.json(await runOps(c.env, c.req.raw.cf as IncomingRequestCfProperties | undefined, body.action, body.params ?? {}, 'mcp'));
});

// AI API 路徑
app.get('/admin/ai/actions', adminGuard, (c) => c.json(Object.entries(OPS_ACTIONS).map(([action, v]) => ({ action, ...v }))));
app.post('/admin/ai/act', adminGuard, async (c) => {
  const body = await c.req.json<{ action: string; params?: Record<string, unknown> }>();
  return c.json(await runOps(c.env, c.req.raw.cf as IncomingRequestCfProperties | undefined, body.action, body.params ?? {}, 'admin-ai:' + c.get('user')!.id));
});

app.get('/admin/overview', adminGuard, async (c) => {
  const db = drizzle(c.env.DB);
  const [[u], [pc], [el]] = await Promise.all([db.select({ n: sql<number>`count(*)` }).from(users), db.select({ n: sql<number>`count(*)` }).from(contents), db.select({ n: sql<number>`count(*)` }).from(emailLogs)]);
  return c.json({ users: u.n, contents: pc.n, emails: el.n });
});

app.get('/admin/emails', adminGuard, async (c) => c.json(await drizzle(c.env.DB).select().from(emailLogs).orderBy(desc(emailLogs.createdAt)).limit(50)));

app.get('/me/ping', userGuard, (c) => c.json({ ok: true, user: c.get('user')!.email }));

app.notFound((c) => c.json({ message: `Cannot ${c.req.method} ${new URL(c.req.url).pathname}`, error: 'Not Found', statusCode: 404 }, 404));

export default app;

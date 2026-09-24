/**
 * SiteKit Cloudflare Workers 殼（API）：Hono ＋ D1（Prisma driver adapter）＋ apps/api 的 controller／guard 原封不動（見 nest-bridge）。
 *   wrangler dev            本機（miniflare 的本機 D1）
 *   wrangler d1 migrations apply sitekit --local|--remote
 *   wrangler deploy
 * 前台（Next）另走 OpenNext；API 與前台同網域時把 /api/* route 指到這個 Worker。
 * 限制：本機磁碟儲存不可用（精靈選 R2）、備份排程與外掛載入（需檔案系統）關閉、逾期訂單掃描改 Cron Trigger。
 */
import 'reflect-metadata';
import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client'; // wrangler.jsonc alias → packages/db/sqlite/client/wasm.js（D1 用 SQLite 版 client）
import { PrismaD1 } from '@prisma/adapter-d1';
import { DATETIME_FIELDS, wrapSqlite } from '@sitekit/db';
import { configureCore, OrdersService, SystemService } from '@sitekit/core';
import { AppModule } from '@sitekit/api/dist/app.module';
import { PrismaService } from '@sitekit/api/dist/prisma/prisma.service';
import { Container } from './container';
// @ts-expect-error 純 JS 模組（apps/api 的種子邏輯，Node 與 Workers 共用）
import { seedBaseline, seedDemo } from '@sitekit/api/prisma/seed-lib.mjs';
import imageTemplates from '@sitekit/api/prisma/image-templates.json';
import { mountControllers } from './nest-bridge';

export interface Env {
  DB: D1Database;
  APP_ENV?: string;
  FRONTEND_URL?: string;
  SESSION_SECRET?: string;
  OPS_TOKEN?: string;
  APP_VERSION?: string;
  SEED_DEMO?: string;
}

let booted: Promise<{ app: Hono; container: Container }> | null = null;

// @prisma/driver-adapter-utils 的 ColumnTypeEnum（數值穩定）：Text=7、DateTime=10
const COL_TEXT = 7;
const COL_DATETIME = 10;
/**
 * adapter-d1 靠「第一個非 null 值的長相」猜欄位型別：String 欄位（例：Setting.value）存了 ISO 日期字串就整欄被當 DateTime，
 * 其他列全部轉型失敗（Error converting field "value"…）。這裡把「欄位名不是 schema 裡任何 DateTime 欄位」的 DateTime 推斷改回 Text。
 * 另：engine 產生的 now()／@updatedAt 以「毫秒整數」傳入而 adapter 原樣寫進 D1，與明確傳 Date 的「ISO 字串」混在同一欄會讀不回；
 * 這裡把 datetime 型別的數值參數統一轉成 adapter 的字串格式。交易物件（startTransaction／transactionContext）一併包。
 */
function fixColumnTypes<T extends object>(adapter: T): T {
  const patchResult = (r: { columnNames?: string[]; columnTypes?: number[] }) => {
    if (r?.columnNames && r?.columnTypes) r.columnTypes = r.columnTypes.map((t, i) => (t === COL_DATETIME && !DATETIME_FIELDS.has(r.columnNames![i]) ? COL_TEXT : t));
    return r;
  };
  const normArgs = (q: { args?: unknown[]; argTypes?: { scalarType?: string }[] }) => {
    if (q?.args && q?.argTypes) q.args = q.args.map((arg, i) => (q.argTypes![i]?.scalarType === 'datetime' && typeof arg === 'number' ? new Date(arg).toISOString().replace('Z', '+00:00') : arg));
    return q;
  };
  const wrap = (o: object): object =>
    new Proxy(o, {
      get(t, prop, rcv) {
        const v = Reflect.get(t, prop, rcv);
        if (typeof v !== 'function') return v;
        if (prop === 'queryRaw') return async (q: unknown, ...a: unknown[]) => patchResult(await v.apply(t, [normArgs(q as never), ...a]));
        if (prop === 'executeRaw') return async (q: unknown, ...a: unknown[]) => v.apply(t, [normArgs(q as never), ...a]);
        // PrismaD1 是 factory：engine 先 connect() 拿 adapter，再由 adapter 開交易——三層都要包
        if (prop === 'connect' || prop === 'startTransaction' || prop === 'transactionContext') return async (...a: unknown[]) => wrap(await v.apply(t, a));
        return v.bind(t);
      },
    });
  return wrap(adapter) as T;
}

async function boot(env: Env) {
  // process.env 由 nodejs_compat_populate_process_env 從 vars／secrets 填入；core 與 apps/api 的 env 都讀它
  process.env.DATABASE_URL ||= 'd1';
  process.env.APP_ENV ||= env.APP_ENV ?? 'production';
  process.env.FRONTEND_URL ||= env.FRONTEND_URL ?? 'http://localhost:3000';
  process.env.STORAGE_DIR ||= '/tmp/sitekit-storage';
  configureCore({ APP_ENV: process.env.APP_ENV, FRONTEND_URL: process.env.FRONTEND_URL, SESSION_SECRET: env.SESSION_SECRET ?? process.env.SESSION_SECRET ?? 'dev-only-secret', OPS_TOKEN: env.OPS_TOKEN ?? process.env.OPS_TOKEN, DATABASE_URL: 'd1', APP_VERSION: env.APP_VERSION ?? process.env.APP_VERSION ?? '0.0.0' } as Parameters<typeof configureCore>[0]);

  const base = new PrismaClient({ adapter: fixColumnTypes(new PrismaD1(env.DB)) } as ConstructorParameters<typeof PrismaClient>[0]);
  const prisma = wrapSqlite(base as unknown as { $extends: (ext: unknown) => unknown }, { emulateInteractiveTx: true, findUniqueAsFindFirst: true });

  const container = new Container();
  container.preset(PrismaService, prisma);
  container.preset(PrismaClient, prisma);
  container.register(AppModule as unknown as new () => unknown);

  const app = new Hono();
  const origin = process.env.FRONTEND_URL;
  app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-allow-headers': c.req.header('access-control-request-headers') ?? 'content-type,authorization' } });
    }
    await next();
    c.res.headers.set('access-control-allow-origin', origin);
    c.res.headers.set('access-control-allow-credentials', 'true');
    c.res.headers.set('vary', 'Origin');
  });
  app.get('/api/assets/*', (c) => c.json({ statusCode: 404, message: 'local storage is not available on Workers; use R2 (storage.driver=s3)' }, 404));
  const routes: string[] = [];
  await mountControllers(app, container, { onRoute: (m, p) => routes.push(`${m} ${p}`) });
  app.notFound((c) => c.json({ statusCode: 404, message: `Cannot ${c.req.method} ${new URL(c.req.url).pathname}`, error: 'Not Found' }, 404));

  // Nest 的 onModuleInit：OrdersService 的 setInterval／SystemModule 的備份排程在 Workers 不適用；機密補齊照做
  await container.runInit((name) => name === 'OrdersService');
  // 等同 sitekit start 的種子：預設設定＋產圖模板（只補缺的）；SEED_DEMO=1 另建示範帳號與內容（本機 e2e 用）
  await seedBaseline(prisma, { isProd: process.env.APP_ENV === 'production', templates: imageTemplates });
  if (env.SEED_DEMO === '1' || process.env.SEED_DEMO === '1') await seedDemo(prisma);
  await (await container.get<SystemService>(SystemService)).ensureSecrets();
  console.log(`[worker] ${routes.length} routes mounted`);
  return { app, container };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    booted ??= boot(env).catch((e) => { booted = null; throw e; });
    const { app } = await booted;
    return app.fetch(request, env, ctx);
  },
  /** Cron Trigger：逾期未付款訂單（原本是 api 程序內每小時 setInterval） */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    booted ??= boot(env).catch((e) => { booted = null; throw e; });
    const { container } = await booted;
    const orders = await container.get<OrdersService>(OrdersService);
    ctx.waitUntil(orders.expirePending());
  },
};

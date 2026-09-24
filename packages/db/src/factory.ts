/**
 * 資料庫工廠：依 DATABASE_URL 決定用哪個 Prisma client。
 * - postgresql://… → apps/api/prisma/schema.prisma 產生的預設 client（@prisma/client）
 * - file:… → packages/db/sqlite/schema.prisma 產生的 client（本機檔案；Cloudflare D1 之後同一份 schema）
 *   SQLite 沒有 Json／String[]／enum，執行期用 $extends 依欄位名自動 parse／stringify，core 的程式碼零改動。
 * - mysql://… → packages/db/mysql/schema.prisma 產生的 client：enum／Json 原生，只有 String[] 走 JSON 字串轉換；
 *   where 的 mode:'insensitive' 拿掉（utf8mb4_unicode_ci 本就不分大小寫）。
 * 回傳型別統一宣告為 Postgres 版 PrismaClient（core 以它編譯）；SQLite 版在執行期結構相容。
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import fieldsJson from './json-fields.json';

const JSON_FIELDS_ALL = new Set<string>(fieldsJson.json);
const ARRAY_FIELDS = new Set<string>(fieldsJson.array);
// 目前作用中的轉換集合：sqlite＝json＋array；mysql＝只有 array（createPrisma 時設定；同一程序只會用一種資料庫）
let JSON_FIELDS = JSON_FIELDS_ALL;
let CONVERT = new Set<string>([...JSON_FIELDS_ALL, ...ARRAY_FIELDS]);
const WRITE_KEYS = new Set(['data', 'create', 'update', 'upsert', 'connectOrCreate', 'createMany', 'updateMany']);
const READ_KEYS = new Set(['where', 'select', 'include', 'orderBy', 'cursor', 'distinct', 'having', 'by']);

export const isSqliteUrl = (url: string) => /^file:/i.test(url);
export const isMysqlUrl = (url: string) => /^mysql:/i.test(url);

/** Prisma.JsonNull／DbNull／AnyNull：可能來自不同 client 實例，用形狀判斷（_getName 或 constructor 名） */
const isNullSentinel = (v: unknown): boolean => {
  if (!v || typeof v !== 'object') return false;
  if (v === Prisma.JsonNull || v === Prisma.DbNull || v === Prisma.AnyNull) return true;
  const name = typeof (v as { _getName?: () => string })._getName === 'function' ? (v as { _getName: () => string })._getName() : (v as object).constructor?.name;
  return name === 'JsonNull' || name === 'DbNull' || name === 'AnyNull';
};
const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** 寫入端：data／create／update 內的 json／array 欄位 → JSON 字串；where 端：陣列篩選改 contains、去掉 mode */
function convertArgs(args: unknown, ctx: 'root' | 'write' | 'read'): unknown {
  if (Array.isArray(args)) return args.map((a) => convertArgs(a, ctx));
  if (!isPlain(args)) return args;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (ctx === 'read' && k === 'mode') continue; // SQLite LIKE 對 ASCII 本就不分大小寫
    if (ctx === 'read' && ARRAY_FIELDS.has(k) && isPlain(v)) {
      const f = v as Record<string, unknown>;
      if ('has' in f) {
        out[k] = { contains: JSON.stringify(f.has) };
        continue;
      }
      if ('hasSome' in f && Array.isArray(f.hasSome)) {
        out.OR = [...((out.OR as unknown[]) ?? []), ...f.hasSome.map((x) => ({ [k]: { contains: JSON.stringify(x) } }))];
        continue;
      }
      if ('isEmpty' in f) {
        out[k] = f.isEmpty ? { in: ['[]', ''] } : { notIn: ['[]', ''] };
        continue;
      }
    }
    if (ctx === 'write' && CONVERT.has(k)) {
      // Prisma 的 Json null 哨兵（JsonNull／DbNull／AnyNull）在 SQLite 是一般 NULL
      if (isNullSentinel(v)) {
        out[k] = null;
        continue;
      }
      if (isPlain(v) && ARRAY_FIELDS.has(k) && ('set' in v || 'push' in v)) {
        const f = v as { set?: unknown; push?: unknown };
        out[k] = JSON.stringify(f.set ?? f.push ?? []);
      } else if (v !== null && v !== undefined && typeof v !== 'string') out[k] = JSON.stringify(v);
      else out[k] = v;
      continue;
    }
    let next: 'root' | 'write' | 'read' = ctx;
    if (ctx === 'root' || ctx === 'write') {
      if (WRITE_KEYS.has(k)) next = 'write';
      else if (READ_KEYS.has(k)) next = 'read';
    }
    if (ctx === 'read' && WRITE_KEYS.has(k)) next = 'write';
    out[k] = convertArgs(v, next);
  }
  return out;
}

/** 讀取端：json／array 欄位的字串 → 物件（深度走訪含關聯） */
function parseResult(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(parseResult);
  if (!isPlain(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v)) {
    if (CONVERT.has(k) && typeof val === 'string') {
      try {
        out[k] = JSON.parse(val);
      } catch {
        out[k] = ARRAY_FIELDS.has(k) ? [] : val;
      }
    } else out[k] = parseResult(val);
  }
  return out;
}

export interface CreatePrismaOptions {
  url?: string;
  log?: ('query' | 'info' | 'warn' | 'error')[];
}

/**
 * 寫入參數必須在「Prisma 複製 args 之前」轉換：query extension 拿到的 args 已被 Prisma 深拷貝，
 * Prisma.JsonNull 這類 class 實例會變成 {}，無法辨識。所以用 Proxy 包住 client／delegate／itx，
 * 在呼叫點先 convertArgs；extension 只負責把結果字串 parse 回物件。
 */
function wrapClient<T extends object>(base: T): T {
  const wrapDelegate = (d: object) =>
    new Proxy(d, {
      get(t, prop, r) {
        const v = Reflect.get(t, prop, r);
        if (typeof v !== 'function') return v;
        return (...a: unknown[]) => (v as (...x: unknown[]) => unknown).apply(t, [convertArgs(a[0], 'root'), ...a.slice(1)]);
      },
    });
  return new Proxy(base, {
    get(t, prop, r) {
      if (prop === '$transaction') {
        const tx = Reflect.get(t, prop, r) as (a: unknown, o?: unknown) => Promise<unknown>;
        return (arg: unknown, opts?: unknown) => (typeof arg === 'function' ? tx.call(t, (itx: object) => (arg as (c: object) => unknown)(wrapClient(itx)), opts) : tx.call(t, arg, opts));
      }
      const v = Reflect.get(t, prop, r);
      if (v && typeof v === 'object' && typeof prop === 'string' && !prop.startsWith('$') && !prop.startsWith('_') && typeof (v as { findMany?: unknown }).findMany === 'function') return wrapDelegate(v as object);
      return typeof v === 'function' ? (v as (...x: unknown[]) => unknown).bind(t) : v;
    },
  }) as T;
}

export function createPrisma(opts: CreatePrismaOptions = {}): PrismaClient {
  const url = opts.url ?? process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL is required（postgresql://…、mysql://… 或 file:/absolute/path/sitekit.db）');
  if (isMysqlUrl(url)) {
    JSON_FIELDS = new Set();
    CONVERT = new Set(ARRAY_FIELDS);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient: My } = require('../mysql/client') as { PrismaClient: new (o?: unknown) => { $extends: (ext: unknown) => unknown } };
    const base = new My({ datasources: { db: { url } }, ...(opts.log ? { log: opts.log } : {}) });
    const extended = base.$extends({
      name: 'sitekit-mysql-array',
      query: { $allModels: { async $allOperations({ args, query }: { args: unknown; query: (a: unknown) => Promise<unknown> }) { return parseResult(await query(args)); } } },
    }) as object;
    return wrapClient(extended) as PrismaClient;
  }
  if (!isSqliteUrl(url)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient: Pg } = require('@prisma/client') as { PrismaClient: new (o?: unknown) => PrismaClient };
    return new Pg({ datasources: { db: { url } }, ...(opts.log ? { log: opts.log } : {}) });
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient: Sq } = require('../sqlite/client') as { PrismaClient: new (o?: unknown) => { $extends: (ext: unknown) => unknown } };
  const base = new Sq({ datasources: { db: { url } }, ...(opts.log ? { log: opts.log } : {}) });
  const extended = base.$extends({
    name: 'sitekit-sqlite-json',
    query: {
      $allModels: {
        async $allOperations({ args, query }: { args: unknown; query: (a: unknown) => Promise<unknown> }) {
          return parseResult(await query(args));
        },
      },
    },
  }) as object;
  return wrapClient(extended) as PrismaClient;
}

/** 給殼層判斷要跑哪套 migration */
export function databaseKind(url = process.env.DATABASE_URL ?? ''): 'sqlite' | 'postgresql' | 'mysql' {
  return isSqliteUrl(url) ? 'sqlite' : isMysqlUrl(url) ? 'mysql' : 'postgresql';
}

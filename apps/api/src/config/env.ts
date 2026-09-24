import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// 開發便利：cwd 下有 .env 就載入（不覆蓋已存在的環境變數；正式環境由平台注入）；Cloudflare Workers（workerd）沒有檔案系統，跳過
const isWorkerd = typeof navigator !== 'undefined' && /Cloudflare-Workers/.test(navigator.userAgent ?? '');
const envFile = isWorkerd ? '' : resolve(process.cwd(), '.env');
if (envFile && existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    /* ignore */
  }
}

const schema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(8).default('dev-only-secret'),
  OPS_TOKEN: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('[env] environment validation failed:', parsed.error.flatten().fieldErrors);
  if (!isWorkerd) process.exit(1);
}
export const env = parsed.success ? parsed.data : schema.parse({ ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'd1' });
export const isProd = env.APP_ENV === 'production';

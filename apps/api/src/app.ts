import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express from 'express';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { configureCore } from '@sitekit/core';
import { AppModule } from './app.module';
import { env } from './config/env';
import { VERSION } from './config/version';
import { DEFAULT_RULES, rateLimit } from './common/rate-limit';
import { ZodExceptionFilter } from './common/zod-exception.filter';
import { HttpErrorFilter } from './common/http-error.filter';

/**
 * 建立並初始化 Nest 應用（不 listen）：
 * - apps/api/main.ts：獨立 api 服務（Zeabur 分離殼）→ createApiApp() 後 app.listen()
 * - apps/server：單體殼 → 取 express 實例掛在同一個 http server 的 /api 下，其餘交給 Next
 */
export async function createApiApp(): Promise<{ app: INestApplication; express: express.Express }> {
  configureCore({ ...env, APP_VERSION: VERSION });
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: env.APP_ENV === 'production' ? ['error', 'warn', 'log'] : undefined });
  const ex = app.getHttpAdapter().getInstance() as express.Express;
  // 反向代理（Zeabur／Cloudflare）後面：取正確來源 IP 與協定
  ex.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  // 金流回呼是 form-urlencoded；CSV 匯入走 JSON 放寬到 5MB
  app.use(express.json({ limit: '45mb' })); // 參考圖 data URL 最多 4×10MB
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(rateLimit(DEFAULT_RULES));
  app.useGlobalFilters(new ZodExceptionFilter(), new HttpErrorFilter());
  app.setGlobalPrefix('api');
  // AI 生成結果等本機檔案：storage/ 由 STORAGE_DIR 指定，正式環境改物件儲存（R2）
  const storageDir = resolve(process.env.STORAGE_DIR ?? resolve(process.cwd(), 'storage'));
  mkdirSync(storageDir, { recursive: true });
  app.use('/api/assets', express.static(storageDir, { maxAge: '1d', index: false }));
  app.enableCors({ origin: env.FRONTEND_URL, credentials: true });
  await app.init();
  return { app, express: ex };
}

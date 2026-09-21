import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express from 'express';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { env } from './config/env';
import { DEFAULT_RULES, rateLimit } from './common/rate-limit';
import { ZodExceptionFilter } from './common/zod-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // 反向代理（Zeabur／Cloudflare）後面：取正確來源 IP 與協定
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  // 金流回呼是 form-urlencoded；CSV 匯入走 JSON 放寬到 5MB
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(rateLimit(DEFAULT_RULES));
  app.useGlobalFilters(new ZodExceptionFilter());
  app.setGlobalPrefix('api');
  // AI 生成結果等本機檔案：storage/ 由 STORAGE_DIR 指定，正式環境改物件儲存（R2）
  const storageDir = resolve(process.env.STORAGE_DIR ?? resolve(process.cwd(), 'storage'));
  mkdirSync(storageDir, { recursive: true });
  app.use('/api/assets', express.static(storageDir, { maxAge: '1d', index: false }));
  app.enableCors({ origin: env.FRONTEND_URL, credentials: true });
  await app.listen(env.PORT);
  console.log('[sitekit-api] ' + env.APP_ENV + ' listening on http://localhost:' + env.PORT + '/api/health');
}
bootstrap();

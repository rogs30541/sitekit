import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express from 'express';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(cookieParser());
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

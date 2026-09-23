import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createPrisma } from '@sitekit/db';
import { env } from '../config/env';
import { PrismaService } from './prisma.service';

/**
 * 依 DATABASE_URL 建立 client：postgresql://（預設 client）或 file:（SQLite client＋Json／陣列／enum 轉換層）。
 * PrismaService 類別只當注入 token 與型別；core 服務的建構子型別是 PrismaClient，這裡把同一實例也註冊在 PrismaClient token。
 */
@Global()
@Module({
  providers: [
    {
      provide: PrismaService,
      useFactory: async () => {
        const client = createPrisma({ url: env.DATABASE_URL });
        await client.$connect();
        return client;
      },
    },
    { provide: PrismaClient, useExisting: PrismaService },
  ],
  exports: [PrismaService, PrismaClient],
})
export class PrismaModule {}

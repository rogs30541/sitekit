import { Controller, Get } from '@nestjs/common';
import { BRAND } from '@sitekit/shared';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

const VERSION = process.env.npm_package_version ?? '0.3.0';
const startedAt = Date.now();

/** 健康檢查：含 DB ping（Zeabur／Uptime 監控用）。 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    let db: 'ok' | 'error' = 'ok';
    const t = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    return {
      ok: db === 'ok',
      service: 'sitekit-api',
      brand: BRAND.name,
      version: VERSION,
      env: env.APP_ENV,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      db,
      dbMs: Date.now() - t,
      at: new Date().toISOString(),
    };
  }
}

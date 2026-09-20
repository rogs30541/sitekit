import { Controller, Get } from '@nestjs/common';
import { BRAND } from '@sitekit/shared';
import { env } from '../../config/env';

@Controller('health')
export class HealthController {
  @Get()
  get() {
    return {
      ok: true,
      service: 'sitekit-api',
      brand: BRAND.name,
      version: '0.1.0',
      env: env.APP_ENV,
      at: new Date().toISOString(),
    };
  }
}

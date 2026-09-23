import { createApiApp } from './app';
import { env } from './config/env';

/** 獨立 api 服務入口（分離殼）；單體殼見 apps/server */
async function bootstrap() {
  const { app } = await createApiApp();
  await app.listen(env.PORT);
  console.log('[sitekit-api] ' + env.APP_ENV + ' listening on http://localhost:' + env.PORT + '/api/health');
}
bootstrap();

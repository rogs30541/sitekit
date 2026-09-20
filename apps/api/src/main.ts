import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableCors({ origin: env.FRONTEND_URL, credentials: true });
  await app.listen(env.PORT);
  console.log('[sitekit-api] ' + env.APP_ENV + ' listening on http://localhost:' + env.PORT + '/api/health');
}
bootstrap();

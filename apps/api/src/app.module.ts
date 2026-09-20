import { Module } from '@nestjs/common';
import { HealthController } from './modules/health/health.controller';
import { AuthController } from './modules/auth/auth.controller';
import { OpsModule } from './modules/ops/ops.module';
import { AdminAiModule } from './modules/admin-ai/admin-ai.module';

@Module({
  imports: [OpsModule, AdminAiModule],
  controllers: [HealthController, AuthController],
})
export class AppModule {}

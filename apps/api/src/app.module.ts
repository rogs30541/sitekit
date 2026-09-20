import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './modules/health/health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { OpsModule } from './modules/ops/ops.module';
import { AdminAiModule } from './modules/admin-ai/admin-ai.module';
import { AdminModule } from './modules/admin/admin.module';
import { ContentModule } from './modules/content/content.module';
import { MigrationModule } from './modules/migration/migration.module';

@Module({
  imports: [PrismaModule, AuthModule, MigrationModule, OpsModule, AdminAiModule, AdminModule, ContentModule],
  controllers: [HealthController],
})
export class AppModule {}

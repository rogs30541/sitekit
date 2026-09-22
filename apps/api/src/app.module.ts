import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './modules/health/health.controller';
import { SettingsModule } from './modules/settings/settings.module';
import { AuthModule } from './modules/auth/auth.module';
import { OpsModule } from './modules/ops/ops.module';
import { AdminAiModule } from './modules/admin-ai/admin-ai.module';
import { AdminModule } from './modules/admin/admin.module';
import { ContentModule } from './modules/content/content.module';
import { MigrationModule } from './modules/migration/migration.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { LearnModule } from './modules/learn/learn.module';
import { VideosModule } from './modules/videos/videos.module';
import { CreditsModule } from './modules/credits/credits.module';
import { StudioModule } from './modules/studio/studio.module';
import { SalesModule } from './modules/sales/sales.module';
import { StorageModule } from './modules/storage/storage.module';
import { NotifyModule } from './modules/notify/notify.module';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { LogisticsModule } from './modules/logistics/logistics.module';

@Module({
  imports: [PrismaModule, SettingsModule, StorageModule, NotifyModule, AuthModule, AdminAuthModule, LogisticsModule, MigrationModule, OpsModule, AdminAiModule, AdminModule, ContentModule, CatalogModule, OrdersModule, PaymentsModule, LearnModule, VideosModule, CreditsModule, StudioModule, SalesModule],
  controllers: [HealthController],
})
export class AppModule {}

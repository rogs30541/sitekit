import { Global, Module } from '@nestjs/common';
import { AdminLogisticsController, LogisticsController } from './logistics.controller';
import { LogisticsService } from '@sitekit/core';

/** Global：OrdersService 試算運費要用 */
@Global()
@Module({ controllers: [LogisticsController, AdminLogisticsController], providers: [LogisticsService], exports: [LogisticsService] })
export class LogisticsModule {}

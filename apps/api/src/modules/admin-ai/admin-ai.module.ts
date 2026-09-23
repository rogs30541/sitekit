import { Module } from '@nestjs/common';
import { OpsModule } from '../ops/ops.module';
import { SettingsModule } from '../settings/settings.module';
import { AdminAiController } from './admin-ai.controller';
import { CommandService } from '@sitekit/core';

@Module({ imports: [OpsModule, SettingsModule], controllers: [AdminAiController], providers: [CommandService] })
export class AdminAiModule {}

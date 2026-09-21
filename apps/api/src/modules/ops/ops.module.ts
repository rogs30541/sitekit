import { Module } from '@nestjs/common';
import { MigrationModule } from '../migration/migration.module';
import { CreditsModule } from '../credits/credits.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({ imports: [MigrationModule, CreditsModule], controllers: [OpsController], providers: [OpsService], exports: [OpsService] })
export class OpsModule {}

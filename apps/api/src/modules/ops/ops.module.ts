import { Module } from '@nestjs/common';
import { MigrationModule } from '../migration/migration.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({ imports: [MigrationModule], controllers: [OpsController], providers: [OpsService], exports: [OpsService] })
export class OpsModule {}

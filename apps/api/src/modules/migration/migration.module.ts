import { Module } from '@nestjs/common';
import { MigrationService } from '@sitekit/core';

@Module({ providers: [MigrationService], exports: [MigrationService] })
export class MigrationModule {}

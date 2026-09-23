import { Module } from '@nestjs/common';
import { AdminCreditsController, CreditsController } from './credits.controller';
import { CreditsService } from '@sitekit/core';

@Module({ controllers: [CreditsController, AdminCreditsController], providers: [CreditsService], exports: [CreditsService] })
export class CreditsModule {}

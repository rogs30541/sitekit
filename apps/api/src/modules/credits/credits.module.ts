import { Module } from '@nestjs/common';
import { AdminCreditsController, CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';

@Module({ controllers: [CreditsController, AdminCreditsController], providers: [CreditsService], exports: [CreditsService] })
export class CreditsModule {}

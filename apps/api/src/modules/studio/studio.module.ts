import { Module } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { AdminStudioController, StudioJobsController, StudioPublicController, UserKeysController } from './studio.controller';
import { StudioService } from './studio.service';

@Module({ imports: [CreditsModule], controllers: [StudioPublicController, StudioJobsController, UserKeysController, AdminStudioController], providers: [StudioService], exports: [StudioService] })
export class StudioModule {}

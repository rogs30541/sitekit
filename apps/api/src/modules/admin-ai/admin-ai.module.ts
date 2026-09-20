import { Module } from '@nestjs/common';
import { OpsModule } from '../ops/ops.module';
import { AdminAiController } from './admin-ai.controller';

@Module({ imports: [OpsModule], controllers: [AdminAiController] })
export class AdminAiModule {}

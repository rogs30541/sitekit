import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { LearnController } from './learn.controller';
import { AdminCommunityController, CommunityController } from './community.controller';

@Module({ imports: [CatalogModule], controllers: [LearnController, CommunityController, AdminCommunityController] })
export class LearnModule {}

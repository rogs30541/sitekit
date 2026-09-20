import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { LearnController } from './learn.controller';

@Module({ imports: [CatalogModule], controllers: [LearnController] })
export class LearnModule {}

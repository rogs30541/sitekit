import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { AdminContentController } from './admin-content.controller';

@Module({ controllers: [ContentController, AdminContentController] })
export class ContentModule {}

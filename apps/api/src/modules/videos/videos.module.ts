import { Module } from '@nestjs/common';
import { AdminVideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({ controllers: [AdminVideosController], providers: [VideosService], exports: [VideosService] })
export class VideosModule {}

import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../../common/guards';
import { VideosService } from './videos.service';

/** 後台影片庫（管理員 session）。前台永不直接讀這裡。 */
@Controller('admin/videos')
@UseGuards(AdminSessionGuard)
export class AdminVideosController {
  constructor(private readonly videos: VideosService) {}

  @Get()
  list(@Query('provider') provider?: string) {
    return this.videos.list(provider);
  }

  @Post('youtube')
  importYouTube(@Body() body: { text?: string; urls?: string[]; playlist?: string }) {
    return this.videos.importYouTube(body ?? {});
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.videos.remove(id);
  }
}

import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../../common/guards';
import { VideosService, parseYouTubeId } from '@sitekit/core';

/** 後台影片庫（管理員 session）。前台永不直接讀這裡。 */
@Controller('admin/videos')
@UseGuards(AdminSessionGuard)
export class AdminVideosController {
  constructor(private readonly videos: VideosService) {}

  @Get()
  list(@Query('provider') provider?: string) {
    return this.videos.list(provider);
  }

  /** 章節抽屜貼網址即時解析：只查 oEmbed，不寫庫。 */
  @Get('resolve')
  async resolve(@Query('url') url = '') {
    const id = parseYouTubeId(url);
    if (!id) throw new BadRequestException('not a YouTube URL or ID');
    return this.videos.resolveYouTube(id);
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

import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AdminSessionGuard, type AuthedRequest } from '../../common/guards';
import { DesignService } from '@sitekit/core';

/** 後台：草稿／沙盒預覽／發佈確認／版本／JSON 匯入匯出（皆走 DesignService，OPS 與 MCP 同一套） */
@Controller('admin/content')
@UseGuards(AdminSessionGuard)
export class AdminDesignController {
  constructor(private readonly design: DesignService) {}

  @Post('import')
  import(@Body() body: Record<string, unknown>, @Req() req: AuthedRequest) {
    return this.design.importDesign(body ?? {}, req.session!.user.email);
  }

  @Get(':id/draft')
  draft(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.design.getDraft(id, req.session!.user.email);
  }

  @Put(':id/draft')
  save(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    return this.design.saveDraft(id, body, req.session!.user.email);
  }

  @Post(':id/preview-token')
  async preview(@Param('id') id: string) {
    const c = await this.design.content(id);
    return this.design.previewLink(c.id);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @Body() body: { confirm?: boolean; note?: string } | undefined, @Req() req: AuthedRequest) {
    return this.design.publish(id, { confirm: body?.confirm === true, note: body?.note }, req.session!.user.email);
  }

  @Get(':id/revisions')
  revisions(@Param('id') id: string) {
    return this.design.revisions(id);
  }

  @Post(':id/revisions/:version/restore')
  restore(@Param('id') id: string, @Param('version') version: string, @Req() req: AuthedRequest) {
    return this.design.restore(id, Number(version), req.session!.user.email);
  }

  @Get(':id/export')
  export(@Param('id') id: string) {
    return this.design.exportDesign(id);
  }
}

/** 公開：沙盒預覽（HMAC token，2 小時） */
@Controller('content')
export class PublicPreviewController {
  constructor(private readonly design: DesignService) {}

  @Get('preview/:id')
  preview(@Param('id') id: string, @Query('token') token: string) {
    return this.design.previewPublic(id, token ?? '');
  }
}

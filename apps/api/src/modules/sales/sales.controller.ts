import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AdminSessionGuard, type AuthedRequest } from '../../common/guards';
import { SalesService } from './sales.service';

/** 後台：一頁式銷售頁（草稿／預覽／確認發佈／版本） */
@Controller('admin/sales')
@UseGuards(AdminSessionGuard)
export class AdminSalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  list() {
    return this.sales.list();
  }

  @Post()
  create(@Body() body: unknown, @Req() req: AuthedRequest) {
    return this.sales.create(body, req.session!.user.email);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.sales.present(await this.sales.page(id));
  }

  @Put(':id/draft')
  save(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    return this.sales.saveDraft(id, body, req.session!.user.email);
  }

  @Post(':id/preview-token')
  async preview(@Param('id') id: string) {
    return this.sales.previewLink((await this.sales.page(id)).id);
  }

  @Post(':id/publish')
  publish(@Param('id') id: string, @Body() body: { confirm?: boolean; note?: string } | undefined, @Req() req: AuthedRequest) {
    return this.sales.publish(id, { confirm: body?.confirm === true, note: body?.note }, req.session!.user.email);
  }

  @Post(':id/unpublish')
  unpublish(@Param('id') id: string) {
    return this.sales.unpublish(id);
  }

  @Get(':id/revisions')
  revisions(@Param('id') id: string) {
    return this.sales.revisions(id);
  }

  @Post(':id/revisions/:version/restore')
  restore(@Param('id') id: string, @Param('version') version: string, @Req() req: AuthedRequest) {
    return this.sales.restore(id, Number(version), req.session!.user.email);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sales.remove(id);
  }
}

/** 前台：線上快照（含排程／密碼）與沙盒預覽 */
@Controller('sales')
export class PublicSalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('preview/:id')
  preview(@Param('id') id: string, @Query('token') token: string) {
    return this.sales.previewPublic(id, token ?? '');
  }

  @Get(':slug')
  page(@Param('slug') slug: string, @Query('pw') pw?: string) {
    return this.sales.publicPage(slug, pw);
  }
}

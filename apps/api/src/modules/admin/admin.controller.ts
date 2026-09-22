import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminSessionGuard, type AuthedRequest } from '../../common/guards';
import { PrismaService } from '../../prisma/prisma.service';
import { MembersService } from './members.service';

/** 後台工作站讀取用 API（管理員 session）。 */
@Controller('admin')
@UseGuards(AdminSessionGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
  ) {}

  /** 會員資料庫（前台會員＋電商客戶／課程學員自動標籤） */
  @Get('members')
  listMembers(@Query('q') q?: string, @Query('tag') tag?: string, @Query('limit') limit?: string) {
    return this.members.list({ q, tag, limit: Number(limit) || undefined });
  }

  @Delete('members/:id')
  deleteMember(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.members.remove(id, `admin:${req.session!.user.email}`);
  }

  /** 批次刪除 */
  @Post('members/delete')
  deleteMembers(@Body() body: { ids?: string[] }, @Req() req: AuthedRequest) {
    return this.members.removeMany(Array.isArray(body?.ids) ? body.ids.map(String).slice(0, 500) : [], `admin:${req.session!.user.email}`);
  }

  @Get('overview')
  async overview() {
    const [users, contents, drafts, orders, paidOrders, redirects, settings] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.content.count({ where: { status: 'published' } }),
      this.prisma.content.count({ where: { status: 'draft' } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: 'paid' } }),
      this.prisma.redirect.count(),
      this.prisma.setting.count(),
    ]);
    return { users, contents, drafts, orders, paidOrders, redirects, settings };
  }

  @Get('audit')
  async audit(@Query('limit') limit = '30') {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(Number(limit) || 30, 200) });
  }

  @Get('users')
  async users(@Query('limit') limit = '50') {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 50, 200),
      select: { id: true, email: true, displayName: true, role: true, status: true, membershipTier: true, createdAt: true },
    });
  }
}

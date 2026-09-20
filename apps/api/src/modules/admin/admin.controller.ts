import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminSessionGuard } from '../../common/guards';
import { PrismaService } from '../../prisma/prisma.service';

/** 後台工作站讀取用 API（管理員 session）。 */
@Controller('admin')
@UseGuards(AdminSessionGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  async overview() {
    const [users, contents, drafts, orders, redirects, settings] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.content.count({ where: { status: 'published' } }),
      this.prisma.content.count({ where: { status: 'draft' } }),
      this.prisma.order.count(),
      this.prisma.redirect.count(),
      this.prisma.setting.count(),
    ]);
    return { users, contents, drafts, orders, redirects, settings };
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

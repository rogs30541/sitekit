import { Body, Controller, Delete, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AdminSessionGuard, UserSessionGuard, type AuthedRequest } from '../../common/guards';
import { PrismaService } from '../../prisma/prisma.service';
import { NotifyService } from '@sitekit/core';

const questionInput = z.object({ chapterId: z.string().nullable().optional(), body: z.string().trim().min(2).max(2000) });
const answerInput = z.object({ answer: z.string().trim().max(5000).nullable().optional(), isPublic: z.boolean().optional(), status: z.enum(['open', 'answered', 'hidden']).optional() });
const announcementInput = z.object({ title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(20000), isPublished: z.boolean().optional() });

const Q_SELECT = { id: true, chapterId: true, body: true, answer: true, answeredAt: true, isPublic: true, status: true, createdAt: true, user: { select: { displayName: true } }, chapter: { select: { title: true } } } as const;

/** 學員端：課程公告與問答（登入即可讀公告與公開問答；提問需有授權）。 */
@Controller('learn')
@UseGuards(UserSessionGuard)
export class CommunityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  private async course(slug: string) {
    const c = await this.prisma.course.findFirst({ where: { slug, isPublished: true }, include: { product: { select: { id: true, name: true } } } });
    if (!c) throw new NotFoundException('course not found');
    return c;
  }
  private async entitled(userId: string, productId: string) {
    const e = await this.prisma.entitlement.findUnique({ where: { userId_productId: { userId, productId } } });
    return !!e && (!e.expiresAt || e.expiresAt > new Date());
  }

  @Get('courses/:slug/community')
  async community(@Param('slug') slug: string, @Req() req: AuthedRequest) {
    const c = await this.course(slug);
    const userId = req.session!.user.id;
    const [announcements, questions, entitled] = await Promise.all([
      this.prisma.courseAnnouncement.findMany({ where: { courseId: c.id, isPublished: true }, orderBy: { publishedAt: 'desc' }, take: 20, select: { id: true, title: true, body: true, publishedAt: true } }),
      this.prisma.courseQuestion.findMany({ where: { courseId: c.id, status: { not: 'hidden' }, OR: [{ isPublic: true }, { userId }] }, orderBy: { createdAt: 'desc' }, take: 100, select: { ...Q_SELECT, userId: true } }),
      this.entitled(userId, c.product.id),
    ]);
    return { entitled, announcements, questions: questions.map(({ userId: uid, ...q }) => ({ ...q, mine: uid === userId })) };
  }

  @Post('courses/:slug/questions')
  async ask(@Param('slug') slug: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    const c = await this.course(slug);
    const userId = req.session!.user.id;
    if (!(await this.entitled(userId, c.product.id))) throw new ForbiddenException('需購買課程才能提問');
    const d = questionInput.parse(body);
    if (d.chapterId) {
      const ch = await this.prisma.chapter.findFirst({ where: { id: d.chapterId, courseId: c.id }, select: { id: true } });
      if (!ch) throw new NotFoundException('chapter not found');
    }
    const q = await this.prisma.courseQuestion.create({ data: { courseId: c.id, chapterId: d.chapterId ?? null, userId, body: d.body }, select: Q_SELECT });
    this.notify.newQuestion({ courseName: c.product.name, question: d.body, from: req.session!.user.email, courseId: c.id }).catch(() => undefined);
    return { ...q, mine: true };
  }
}

/** 後台：問答回覆／顯示控制、公告 CRUD。 */
@Controller('admin')
@UseGuards(AdminSessionGuard)
export class AdminCommunityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  @Get('courses/:id/questions')
  questions(@Param('id') courseId: string, @Query('status') status?: string) {
    return this.prisma.courseQuestion.findMany({ where: { courseId, ...(status ? { status } : {}) }, orderBy: { createdAt: 'desc' }, take: 300, select: { ...Q_SELECT, user: { select: { displayName: true, email: true } } } });
  }

  @Get('questions')
  allQuestions(@Query('status') status?: string) {
    return this.prisma.courseQuestion.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 300, select: { ...Q_SELECT, courseId: true, course: { select: { slug: true, product: { select: { name: true } } } }, user: { select: { displayName: true, email: true } } } });
  }

  @Patch('questions/:id')
  async answer(@Param('id') id: string, @Body() body: unknown, @Req() req: AuthedRequest) {
    const d = answerInput.parse(body);
    const q = await this.prisma.courseQuestion.findUnique({ where: { id }, include: { user: { select: { email: true, displayName: true } }, course: { select: { slug: true, product: { select: { name: true } } } } } });
    if (!q) throw new NotFoundException('question not found');
    const answering = d.answer !== undefined && d.answer !== null && d.answer.trim() !== '' && d.answer !== q.answer;
    const updated = await this.prisma.courseQuestion.update({
      where: { id },
      data: { ...(d.answer !== undefined ? { answer: d.answer || null } : {}), ...(answering ? { answeredAt: new Date(), answeredBy: req.session!.user.email, status: d.status ?? 'answered' } : {}), ...(d.status && !answering ? { status: d.status } : {}), ...(d.isPublic !== undefined ? { isPublic: d.isPublic } : {}) },
      select: Q_SELECT,
    });
    if (answering) this.notify.questionAnswered({ to: q.user.email, name: q.user.displayName, courseName: q.course.product.name, slug: q.course.slug, question: q.body, answer: d.answer! }).catch(() => undefined);
    return updated;
  }

  @Get('courses/:id/announcements')
  announcements(@Param('id') courseId: string) {
    return this.prisma.courseAnnouncement.findMany({ where: { courseId }, orderBy: { publishedAt: 'desc' } });
  }

  @Post('courses/:id/announcements')
  async createAnnouncement(@Param('id') courseId: string, @Body() body: unknown) {
    const d = announcementInput.parse(body);
    const c = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!c) throw new NotFoundException('course not found');
    return this.prisma.courseAnnouncement.create({ data: { courseId, title: d.title, body: d.body, isPublished: d.isPublished ?? true } });
  }

  @Patch('announcements/:id')
  updateAnnouncement(@Param('id') id: string, @Body() body: unknown) {
    const d = announcementInput.partial().parse(body);
    return this.prisma.courseAnnouncement.update({ where: { id }, data: d });
  }

  @Delete('announcements/:id')
  async deleteAnnouncement(@Param('id') id: string) {
    await this.prisma.courseAnnouncement.delete({ where: { id } });
    return { deleted: id };
  }
}

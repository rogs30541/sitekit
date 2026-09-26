import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ContactService } from '@sitekit/core';
import { AdminSessionGuard, type AuthedRequest } from '../../common/guards';

/** 公開：前台 contact 區塊（showForm）送出表單 */
@Controller('content')
export class PublicContactController {
  constructor(private readonly contact: ContactService) {}

  @Post('contact')
  submit(@Body() body: unknown, @Req() req: Request) {
    const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    return this.contact.submit(body, { ip: fwd || req.ip || undefined, userAgent: String(req.headers['user-agent'] ?? '') });
  }
}

/** 後台「表單訊息」：列表／狀態／備註／刪除（與 OPS list_contact_messages 等同一套服務） */
@Controller('admin/messages')
@UseGuards(AdminSessionGuard)
export class AdminMessagesController {
  constructor(private readonly contact: ContactService) {}

  @Get()
  async list(@Query('status') status?: string, @Query('limit') limit?: string) {
    return { counts: await this.contact.counts(), items: await this.contact.list({ status, limit: limit ? Number(limit) : undefined }) };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { status?: string; note?: string } | undefined, @Req() req: AuthedRequest) {
    return this.contact.update(id, body ?? {}, req.session!.user.email);
  }

  @Post(':id/reply')
  reply(@Param('id') id: string, @Body() body: { reply?: string; subject?: string } | undefined, @Req() req: AuthedRequest) {
    return this.contact.reply(id, { reply: String(body?.reply ?? ''), subject: body?.subject }, req.session!.user.email);
  }

  /** AI 擬回覆草稿（不寄信；同 OPS draft_contact_reply） */
  @Post(':id/draft')
  draft(@Param('id') id: string, @Body() body: { tone?: string; points?: string } | undefined) {
    return this.contact.draftReply(id, { tone: body?.tone, points: body?.points });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.contact.remove(id);
  }
}

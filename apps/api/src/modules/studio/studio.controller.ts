import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AdminSessionGuard, UserSessionGuard, type AuthedRequest } from '../../common/guards';
import { StudioService } from './studio.service';

/** 公開：模板清單（不含 systemPrompt、不含成本／毛利）。 */
@Controller('studio')
export class StudioPublicController {
  constructor(private readonly studio: StudioService) {}

  @Get('templates')
  templates() {
    return this.studio.listTemplates();
  }
}

@Controller('studio/jobs')
@UseGuards(UserSessionGuard)
export class StudioJobsController {
  constructor(private readonly studio: StudioService) {}

  @Post()
  create(@Body() body: unknown, @Req() req: AuthedRequest) {
    return this.studio.createJob(req.session!.user.id, body);
  }

  @Get()
  mine(@Req() req: AuthedRequest) {
    return this.studio.listMine(req.session!.user.id);
  }

  @Get(':id')
  get(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.studio.getMine(req.session!.user.id, id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.studio.cancel(req.session!.user.id, id);
  }
}

/** BYOK：用戶自帶金鑰，只回 last4。 */
@Controller('me/keys')
@UseGuards(UserSessionGuard)
export class UserKeysController {
  constructor(private readonly studio: StudioService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.studio.listKeys(req.session!.user.id);
  }

  @Put(':provider')
  set(@Param('provider') provider: string, @Body() body: { apiKey: string; enabled?: boolean }, @Req() req: AuthedRequest) {
    return this.studio.setKey(req.session!.user.id, provider, String(body?.apiKey ?? ''), body?.enabled !== false);
  }

  @Patch(':provider')
  toggle(@Param('provider') provider: string, @Body() body: { enabled: boolean }, @Req() req: AuthedRequest) {
    return this.studio.toggleKey(req.session!.user.id, provider, !!body?.enabled);
  }

  @Delete(':provider')
  remove(@Param('provider') provider: string, @Req() req: AuthedRequest) {
    return this.studio.deleteKey(req.session!.user.id, provider);
  }
}

@Controller('admin/studio')
@UseGuards(AdminSessionGuard)
export class AdminStudioController {
  constructor(private readonly studio: StudioService) {}

  @Get('templates')
  templates() {
    return this.studio.listTemplatesAdmin();
  }

  @Post('templates')
  create(@Body() body: unknown) {
    return this.studio.createTemplate(body);
  }

  @Patch('templates/:id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.studio.updateTemplate(id, body);
  }

  @Delete('templates/:id')
  remove(@Param('id') id: string) {
    return this.studio.deleteTemplate(id);
  }

  @Get('jobs')
  jobs(@Query('limit') limit = '100') {
    return this.studio.listAll(Number(limit) || 100);
  }
}


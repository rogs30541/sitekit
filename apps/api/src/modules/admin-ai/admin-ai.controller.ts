import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AdminSessionGuard, type AuthedRequest } from '../../common/guards';
import { OpsService } from '../ops/ops.service';
import { CommandService, type ChatTurn } from './command.service';

/** AI API 路徑：/api/admin/ai/*，只認後台 cookie session。與 MCP 路徑共用 OpsService。 */
@Controller('admin/ai')
@UseGuards(AdminSessionGuard)
export class AdminAiController {
  constructor(
    private readonly ops: OpsService,
    private readonly command: CommandService,
  ) {}

  @Get('actions')
  actions() {
    return this.ops.listActions();
  }

  /** 後台 AI 面板／指令台確認後直接觸發既有維運動作。 */
  @Post('act')
  act(@Body() body: { action: string; params?: Record<string, unknown> }, @Req() req: AuthedRequest) {
    return this.ops.run(body.action, body.params, 'admin-ai:' + req.session!.user.id);
  }

  /** 指令台設定與可用動作／七大工作項目 */
  @Get('command/config')
  async commandConfig() {
    const c = await this.command.config();
    return { provider: c.provider, model: c.model, ready: c.ready, anthropicConfigured: c.anthropicConfigured, openaiConfigured: c.openaiConfigured, geminiConfigured: c.geminiConfigured, tasks: c.tasks, actions: c.actions };
  }

  /** 自動偵測供應商可用模型（可先傳 apiKey 測試，不必先儲存） */
  @Post('command/models')
  models(@Body() body: { provider?: string; apiKey?: string } | undefined) {
    return this.command.listModels(String(body?.provider ?? 'anthropic'), body?.apiKey);
  }

  /** 自然語言指令 → 唯讀動作立即執行、寫入動作列成待確認 */
  @Post('command')
  run(@Body() body: { message: string; history?: ChatTurn[] }, @Req() req: AuthedRequest) {
    return this.command.run(body ?? { message: '' }, 'admin-ai:' + req.session!.user.id);
  }

  /** 使用者按下確認：以 token 執行待確認清單 */
  @Post('command/confirm')
  confirm(@Body() body: { token: string }, @Req() req: AuthedRequest) {
    return this.command.confirm(body?.token ?? '', 'admin-ai:' + req.session!.user.id);
  }
}

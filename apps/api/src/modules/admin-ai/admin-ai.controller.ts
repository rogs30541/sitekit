import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AdminSessionGuard, type AuthedRequest } from '../../common/guards';
import { OpsService } from '../ops/ops.service';

/** AI API 路徑：/api/admin/ai/*，只認後台 cookie session。與 MCP 路徑共用 OpsService。 */
@Controller('admin/ai')
@UseGuards(AdminSessionGuard)
export class AdminAiController {
  constructor(private readonly ops: OpsService) {}

  @Get('actions')
  actions() {
    return this.ops.listActions();
  }

  /** 後台 AI 助手代為觸發既有維運動作。正式版先呼叫模型規劃 action+params，再落到同一個 run()。 */
  @Post('act')
  act(@Body() body: { action: string; params?: Record<string, unknown> }, @Req() req: AuthedRequest) {
    return this.ops.run(body.action, body.params, 'admin-ai:' + req.session?.userId);
  }
}

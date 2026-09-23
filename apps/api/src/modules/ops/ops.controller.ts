import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { OperatorTokenGuard } from '../../common/guards';
import { OpsService } from '@sitekit/core';

/** MCP 路徑：/api/ops/*，只認 Bearer OPS_TOKEN。 */
@Controller('ops')
@UseGuards(OperatorTokenGuard)
export class OpsController {
  constructor(private readonly ops: OpsService) {}

  @Get('actions')
  actions() {
    return this.ops.listActions();
  }

  @Post('run')
  run(@Body() body: { action: string; params?: Record<string, unknown> }) {
    return this.ops.run(body.action, body.params, 'mcp');
  }
}

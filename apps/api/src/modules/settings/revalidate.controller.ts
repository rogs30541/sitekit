import { Body, Controller, Post } from '@nestjs/common';
import { RevalidateService } from '@sitekit/core';

/** web 端沒有共享密鑰時用來驗 token（公開端點，只回 ok 布林） */
@Controller('internal/revalidate')
export class RevalidateController {
  constructor(private readonly reval: RevalidateService) {}
  @Post('verify')
  verify(@Body() body: { token?: string }) {
    return { ok: this.reval.verify(String(body?.token ?? '')) };
  }
}

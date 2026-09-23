import { Global, Module } from '@nestjs/common';
import { NotifyService } from '@sitekit/core';

@Global()
@Module({ providers: [NotifyService], exports: [NotifyService] })
export class NotifyModule {}

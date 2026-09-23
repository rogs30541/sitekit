import { Global, Module } from '@nestjs/common';
import { SettingsService } from '@sitekit/core';
import { RevalidateService } from '@sitekit/core';
import { RevalidateController } from './revalidate.controller';

/** 全域：設定讀取＋發佈即清快取（settings.invalidate() 時一併通知 web） */
@Global()
@Module({
  controllers: [RevalidateController],
  providers: [
    SettingsService,
    {
      provide: RevalidateService,
      inject: [SettingsService],
      useFactory: (settings: SettingsService) => {
        const r = new RevalidateService(() => settings.siteUrl());
        settings.onInvalidate = () => r.trigger('settings');
        return r;
      },
    },
  ],
  exports: [SettingsService, RevalidateService],
})
export class SettingsModule {}

import { Global, Module } from '@nestjs/common';
import { StorageService } from '@sitekit/core';

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}

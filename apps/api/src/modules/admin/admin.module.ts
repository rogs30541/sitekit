import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { MembersService } from '@sitekit/core';

@Module({ controllers: [AdminController], providers: [MembersService], exports: [MembersService] })
export class AdminModule {}

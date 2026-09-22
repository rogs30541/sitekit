import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { MembersService } from './members.service';

@Module({ controllers: [AdminController], providers: [MembersService], exports: [MembersService] })
export class AdminModule {}

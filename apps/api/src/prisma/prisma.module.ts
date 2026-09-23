import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from './prisma.service';

/** core 服務的建構子型別是 PrismaClient；這裡把同一個實例也註冊在 PrismaClient token 下 */
@Global()
@Module({ providers: [PrismaService, { provide: PrismaClient, useExisting: PrismaService }], exports: [PrismaService, PrismaClient] })
export class PrismaModule {}

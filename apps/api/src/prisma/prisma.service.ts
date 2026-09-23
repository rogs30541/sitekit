import { PrismaClient } from '@prisma/client';

/** 只作為注入 token 與型別；實例由 PrismaModule 的工廠（@sitekit/db createPrisma）提供 */
export class PrismaService extends PrismaClient {}

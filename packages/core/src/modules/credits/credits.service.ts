import { BadRequestException, Injectable, NotFoundException } from '../../compat';
import type { Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * 點數帳本：users.creditBalance（持有）／creditReserved（保留中），available = balance − reserved。
 * 生成任務建立時 reserve、成功 settle（扣持有＋解除保留、寫 ledger consume）、失敗 release（只解除保留）。
 * ledger 只記「持有點數」的變動（grant／adjust／consume／refund），保留是暫態不入帳。
 */
@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaClient) {}

  async balance(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { creditBalance: true, creditReserved: true } });
    if (!u) throw new NotFoundException('user not found');
    return { stored: u.creditBalance, reserved: u.creditReserved, available: u.creditBalance - u.creditReserved };
  }

  ledger(userId: string, limit = 50) {
    return this.prisma.creditLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200) });
  }

  async findUser(emailOrId: string) {
    const key = emailOrId.trim().toLowerCase();
    if (!key) throw new BadRequestException('email or userId required');
    const u = await this.prisma.user.findFirst({ where: { OR: [{ id: emailOrId.trim() }, { email: key }] }, select: { id: true, email: true } });
    if (!u) throw new NotFoundException('user not found');
    return u;
  }

  /** 管理員／維運調整（正負皆可，不可讓持有點數變負）。 */
  async adjust(userId: string, amount: number, reason: string, createdBy: string, type = amount > 0 ? 'grant' : 'adjust') {
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.findUnique({ where: { id: userId }, select: { creditBalance: true, creditReserved: true } });
      if (!u) throw new NotFoundException('user not found');
      const after = u.creditBalance + amount;
      if (after < 0) throw new BadRequestException(`insufficient balance: ${u.creditBalance} + (${amount}) < 0`);
      await tx.user.update({ where: { id: userId }, data: { creditBalance: after } });
      await tx.creditLedger.create({ data: { userId, type, amount, balanceAfter: after, reason: reason.slice(0, 300), createdBy } });
      return { stored: after, reserved: u.creditReserved, available: after - u.creditReserved };
    });
  }

  async reserve(tx: Tx, userId: string, amount: number) {
    const u = await tx.user.findUnique({ where: { id: userId }, select: { creditBalance: true, creditReserved: true } });
    if (!u) throw new NotFoundException('user not found');
    if (u.creditBalance - u.creditReserved < amount) throw new BadRequestException(`可用點數不足，本次需要 ${amount} 點，可用 ${u.creditBalance - u.creditReserved} 點`);
    await tx.user.update({ where: { id: userId }, data: { creditReserved: { increment: amount } } });
  }

  async settle(tx: Tx, userId: string, amount: number, jobId: string, reason: string) {
    const u = await tx.user.update({ where: { id: userId }, data: { creditBalance: { decrement: amount }, creditReserved: { decrement: amount } }, select: { creditBalance: true } });
    await tx.creditLedger.create({ data: { userId, type: 'consume', amount: -amount, balanceAfter: u.creditBalance, jobId, reason } });
  }

  async release(tx: Tx, userId: string, amount: number) {
    await tx.user.update({ where: { id: userId }, data: { creditReserved: { decrement: amount } } });
  }
}

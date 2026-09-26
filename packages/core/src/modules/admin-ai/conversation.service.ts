import { BadRequestException, Injectable, NotFoundException } from '../../compat';
import { PrismaClient } from '@prisma/client';

/**
 * AI 指令台對話記錄落庫：每位管理員自己的對話（前端 Turn[] 原樣存 JSON，含已查詢／待確認／已執行卡）。
 * 後台指令台每回合自動儲存；可切換舊對話繼續、刪除。OPS list_ai_conversations 只列摘要（系統類，不開放給指令台本身）。
 */
export interface StoredTurn {
  role: 'user' | 'assistant' | 'system';
  text: string;
  [k: string]: unknown;
}
const MAX_TURNS = 80;
const MAX_TEXT = 20_000;

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaClient) {}

  list(adminId: string, limit = 30) {
    return this.prisma.adminAiConversation.findMany({ where: { adminId }, orderBy: { updatedAt: 'desc' }, take: Math.min(Math.max(limit, 1), 200), select: { id: true, title: true, turnCount: true, createdAt: true, updatedAt: true } });
  }

  /** 全站摘要（OPS／MCP 用；不含內容） */
  listAll(limit = 50) {
    return this.prisma.adminAiConversation.findMany({ orderBy: { updatedAt: 'desc' }, take: Math.min(Math.max(limit, 1), 200), select: { id: true, adminId: true, title: true, turnCount: true, createdAt: true, updatedAt: true } });
  }

  async get(adminId: string, id: string) {
    const c = await this.prisma.adminAiConversation.findUnique({ where: { id } });
    if (!c || c.adminId !== adminId) throw new NotFoundException('conversation not found');
    return c;
  }

  /** 儲存（有 id 且是本人→更新；否則新建）。標題預設取第一句使用者指令。 */
  async save(adminId: string, input: { id?: string; title?: string; turns: unknown }) {
    if (!Array.isArray(input.turns)) throw new BadRequestException('turns 需為陣列');
    const turns = (input.turns as unknown[])
      .filter((t): t is StoredTurn => !!t && typeof t === 'object' && typeof (t as StoredTurn).role === 'string' && typeof (t as StoredTurn).text === 'string')
      .slice(-MAX_TURNS)
      .map((t) => ({ ...t, text: t.text.slice(0, MAX_TEXT) }));
    if (!turns.length) throw new BadRequestException('turns 不可為空');
    const firstUser = turns.find((t) => t.role === 'user')?.text ?? '';
    const title = String(input.title ?? '').trim().slice(0, 120) || firstUser.replace(/\s+/g, ' ').trim().slice(0, 60) || '（未命名對話）';
    const data = { title, turns: turns as object[], turnCount: turns.length };
    if (input.id) {
      const cur = await this.prisma.adminAiConversation.findUnique({ where: { id: input.id }, select: { adminId: true } });
      if (cur && cur.adminId !== adminId) throw new NotFoundException('conversation not found');
      if (cur) return this.prisma.adminAiConversation.update({ where: { id: input.id }, data, select: { id: true, title: true, turnCount: true, updatedAt: true } });
    }
    return this.prisma.adminAiConversation.create({ data: { ...data, adminId }, select: { id: true, title: true, turnCount: true, updatedAt: true } });
  }

  async rename(adminId: string, id: string, title: string) {
    await this.get(adminId, id);
    const t = String(title ?? '').trim().slice(0, 120);
    if (!t) throw new BadRequestException('title is required');
    return this.prisma.adminAiConversation.update({ where: { id }, data: { title: t }, select: { id: true, title: true, turnCount: true, updatedAt: true } });
  }

  async remove(adminId: string, id: string) {
    await this.get(adminId, id);
    await this.prisma.adminAiConversation.delete({ where: { id } });
    return { deleted: true, id };
  }
}

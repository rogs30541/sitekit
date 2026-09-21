import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { decryptSecret, encryptSecret } from './crypto';
import { getProvider } from './providers';

const SIZES = ['1024x1024', '1536x1024', '1024x1536'] as const;
const createJobInput = z.object({
  templateId: z.string().nullable().optional(),
  prompt: z.string().trim().max(2000).default(''),
  inputs: z.record(z.string().max(2000)).optional(),
  quality: z.enum(['standard', 'high']).default('standard'),
  size: z.enum(SIZES).optional(),
});
const templateInput = z.object({
  key: z.string().trim().min(1).max(60).regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().max(40).default('general'),
  description: z.string().max(500).nullable().optional(),
  coverUrl: z.string().url().nullable().optional().or(z.literal('').transform(() => null)),
  systemPrompt: z.string().trim().min(5).max(8000),
  inputFields: z.array(z.object({ key: z.string().min(1).max(40), label: z.string().min(1).max(60), type: z.enum(['text', 'textarea', 'select']).default('text'), required: z.boolean().default(false), placeholder: z.string().max(200).optional(), options: z.array(z.string()).optional() })).default([]),
  defaultSize: z.enum(SIZES).default('1024x1024'),
  costPoints: z.number().int().min(0).default(5),
  highCostPoints: z.number().int().min(0).default(15),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(100),
});
const DEFAULT_COST = { standard: 5, high: 15 };
const PUBLIC_TEMPLATE = { id: true, key: true, name: true, category: true, description: true, coverUrl: true, inputFields: true, defaultSize: true, costPoints: true, highCostPoints: true } as const;

function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new BadRequestException(r.error.flatten().fieldErrors);
  return r.data as z.infer<S>;
}

/**
 * AI 工作站：模板 → 任務（保留點數）→ 佇列執行（Provider）→ 結算／釋放。
 * 佇列：無 Redis 時用程序內序列執行（重啟自動補跑 queued）；接上 Redis 後可換 BullMQ 而不動這裡的狀態機。
 */
@Injectable()
export class StudioService implements OnModuleInit {
  private readonly log = new Logger(StudioService.name);
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {}

  async onModuleInit() {
    // 崩潰復原：running 退回 queued，全部補跑
    await this.prisma.aiJob.updateMany({ where: { status: 'running' }, data: { status: 'queued' } });
    const pending = await this.prisma.aiJob.findMany({ where: { status: 'queued' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    for (const j of pending) this.enqueue(j.id);
    if (pending.length) this.log.log(`requeued ${pending.length} job(s)`);
  }

  // ---- 模板 ----
  listTemplates() {
    return this.prisma.aiTemplate.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: PUBLIC_TEMPLATE });
  }
  listTemplatesAdmin() {
    return this.prisma.aiTemplate.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }
  createTemplate(input: unknown) {
    const d = parse(templateInput, input);
    return this.prisma.aiTemplate.create({ data: { ...d, inputFields: d.inputFields as Prisma.InputJsonValue } });
  }
  updateTemplate(id: string, input: unknown) {
    const d = parse(templateInput.partial(), input);
    return this.prisma.aiTemplate.update({ where: { id }, data: { ...d, ...(d.inputFields ? { inputFields: d.inputFields as Prisma.InputJsonValue } : {}) } });
  }
  deleteTemplate(id: string) {
    return this.prisma.aiTemplate.delete({ where: { id } });
  }

  // ---- BYOK ----
  async listKeys(userId: string) {
    const rows = await this.prisma.userApiKey.findMany({ where: { userId }, select: { provider: true, last4: true, enabled: true, updatedAt: true } });
    return rows;
  }
  async setKey(userId: string, provider: string, apiKey: string, enabled = true) {
    if (!['openai'].includes(provider)) throw new BadRequestException('unsupported provider');
    const trimmed = apiKey.trim();
    if (trimmed.length < 20) throw new BadRequestException('api key looks invalid');
    const row = await this.prisma.userApiKey.upsert({
      where: { userId_provider: { userId, provider } },
      update: { encrypted: encryptSecret(trimmed), last4: trimmed.slice(-4), enabled },
      create: { userId, provider, encrypted: encryptSecret(trimmed), last4: trimmed.slice(-4), enabled },
    });
    return { provider: row.provider, last4: row.last4, enabled: row.enabled };
  }
  async toggleKey(userId: string, provider: string, enabled: boolean) {
    const row = await this.prisma.userApiKey.update({ where: { userId_provider: { userId, provider } }, data: { enabled } });
    return { provider: row.provider, last4: row.last4, enabled: row.enabled };
  }
  deleteKey(userId: string, provider: string) {
    return this.prisma.userApiKey.deleteMany({ where: { userId, provider } });
  }
  private async userKey(userId: string, provider: string) {
    const row = await this.prisma.userApiKey.findUnique({ where: { userId_provider: { userId, provider } } });
    return row?.enabled ? decryptSecret(row.encrypted) : null;
  }

  // ---- 任務 ----
  async createJob(userId: string, input: unknown) {
    const d = parse(createJobInput, input);
    const template = d.templateId ? await this.prisma.aiTemplate.findFirst({ where: { id: d.templateId, isActive: true } }) : null;
    if (d.templateId && !template) throw new NotFoundException('template not found');
    if (!template && !d.prompt) throw new BadRequestException('prompt is required');
    if (template) {
      for (const f of (template.inputFields as { key: string; label: string; required?: boolean }[]) ?? []) {
        if (f.required && !d.inputs?.[f.key]?.trim()) throw new BadRequestException(`請填寫「${f.label}」`);
      }
    }
    const cost = template ? (d.quality === 'high' ? template.highCostPoints : template.costPoints) : DEFAULT_COST[d.quality];
    const ai = await this.settings.ai();
    const byokKey = await this.userKey(userId, 'openai');
    const byok = !!byokKey;
    const provider = byok ? 'openai' : ai.provider;
    if (provider === 'openai' && !byok && !ai.platformKeyConfigured) throw new BadRequestException('平台尚未設定 OpenAI 金鑰，請在「我的金鑰」自帶金鑰或聯絡管理員');
    const job = await this.prisma.$transaction(async (tx) => {
      if (!byok && cost > 0) await this.credits.reserve(tx, userId, cost);
      return tx.aiJob.create({
        data: { userId, kind: 'image', templateId: template?.id ?? null, prompt: d.prompt, inputs: (d.inputs ?? {}) as Prisma.InputJsonValue, quality: d.quality, size: d.size ?? template?.defaultSize ?? '1024x1024', provider, byok, costPoints: byok ? 0 : cost },
      });
    });
    this.enqueue(job.id);
    return job;
  }

  listMine(userId: string) {
    return this.prisma.aiJob.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50, include: { template: { select: { name: true } } } });
  }
  async getMine(userId: string, id: string) {
    const j = await this.prisma.aiJob.findFirst({ where: { id, userId }, include: { template: { select: { name: true } } } });
    if (!j) throw new NotFoundException('job not found');
    return j;
  }
  async cancel(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const j = await tx.aiJob.findFirst({ where: { id, userId } });
      if (!j) throw new NotFoundException('job not found');
      if (j.status !== 'queued') throw new BadRequestException('only queued jobs can be canceled');
      if (!j.byok && j.costPoints > 0) await this.credits.release(tx, userId, j.costPoints);
      return tx.aiJob.update({ where: { id }, data: { status: 'canceled', finishedAt: new Date() } });
    });
  }
  listAll(limit = 100) {
    return this.prisma.aiJob.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(limit, 500), include: { user: { select: { email: true } }, template: { select: { name: true } } } });
  }

  // ---- 佇列（程序內序列）----
  private enqueue(id: string) {
    this.chain = this.chain.then(() => this.process(id)).catch((e) => this.log.error(`job ${id}: ${e instanceof Error ? e.message : e}`));
  }

  private async process(id: string) {
    const job = await this.prisma.aiJob.findUnique({ where: { id }, include: { template: true } });
    if (!job || job.status !== 'queued') return;
    await this.prisma.aiJob.update({ where: { id }, data: { status: 'running', startedAt: new Date() } });
    try {
      const ai = await this.settings.ai();
      const apiKey = job.byok ? await this.userKey(job.userId, 'openai') : ai.openaiKey;
      const inputs = (job.inputs ?? {}) as Record<string, string>;
      const fields = ((job.template?.inputFields as { key: string; label: string }[] | null) ?? []).filter((f) => inputs[f.key]).map((f) => `${f.label}：${inputs[f.key]}`);
      const prompt = [job.template?.systemPrompt, ...fields, job.prompt].filter(Boolean).join('\n');
      const result = await getProvider(job.provider ?? 'mock').generate({ prompt, size: job.size, quality: job.quality as 'standard' | 'high', apiKey: apiKey ?? undefined, model: ai.imageModel });
      const file = `${job.id}.${result.ext}`;
      const put = await this.storage.put(`ai/${file}`, result.bytes, result.ext === 'png' ? 'image/png' : result.ext === 'svg' ? 'image/svg+xml' : result.ext === 'webp' ? 'image/webp' : 'image/jpeg');
      const resultUrl = put.driver === 's3' ? put.url : `/api/assets/ai/${file}`;
      await this.prisma.$transaction(async (tx) => {
        if (!job.byok && job.costPoints > 0) await this.credits.settle(tx, job.userId, job.costPoints, job.id, `AI 圖片生成${job.template ? `：${job.template.name}` : ''}`);
        await tx.aiJob.update({ where: { id }, data: { status: 'succeeded', resultUrl, costTwd: result.costTwd ?? null, finishedAt: new Date() } });
      });
    } catch (e) {
      const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      await this.prisma.$transaction(async (tx) => {
        if (!job.byok && job.costPoints > 0) await this.credits.release(tx, job.userId, job.costPoints);
        await tx.aiJob.update({ where: { id }, data: { status: 'failed', error, finishedAt: new Date() } });
      });
      this.log.warn(`job ${id} failed: ${error}`);
    }
  }
}

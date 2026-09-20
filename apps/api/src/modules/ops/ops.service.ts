import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OPS_ACTIONS, OPS_ACTION_KEYS, type OpsAction, type OpsResult } from '@sitekit/shared';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { MigrationService } from '../migration/migration.service';

const SECRET_KEY = /secret|key|token|password|hash_iv/i;

/**
 * 後台維運執行層：MCP 路徑與 AI API 路徑共用的唯一入口。
 * 設定存 settings 表、每次會改動狀態的操作都寫 audit_logs。
 */
@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly migration: MigrationService,
  ) {}

  listActions() {
    return OPS_ACTION_KEYS.map((k) => ({ action: k, ...OPS_ACTIONS[k] }));
  }

  async run(action: string, params: Record<string, unknown> | undefined, actor: string): Promise<OpsResult> {
    if (!OPS_ACTION_KEYS.includes(action as OpsAction)) throw new BadRequestException('unknown action: ' + action);
    const a = action as OpsAction;
    const base = { action: a, actor, at: new Date().toISOString() };
    const p = params ?? {};
    try {
      const data = await this.execute(a, p);
      if (OPS_ACTIONS[a].mutating) await this.log(actor, a, p, true, data);
      return { ok: true, ...base, data };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await this.log(actor, a, p, false, undefined, error);
      return { ok: false, ...base, error };
    }
  }

  private async log(actor: string, action: string, params: Record<string, unknown>, ok: boolean, result?: unknown, error?: string) {
    const safeParams = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, k === 'csv' ? '<csv omitted>' : v]));
    await this.prisma.auditLog.create({
      data: { actor, action, ok, error, params: safeParams as Prisma.InputJsonValue, result: (result ?? null) as Prisma.InputJsonValue },
    });
  }

  private async execute(action: OpsAction, p: Record<string, unknown>): Promise<unknown> {
    switch (action) {
      case 'status': {
        const [users, contents, orders, lastDeploy] = await Promise.all([
          this.prisma.user.count(),
          this.prisma.content.count({ where: { status: 'published' } }),
          this.prisma.order.count(),
          this.prisma.auditLog.findFirst({ where: { action: 'deploy', ok: true }, orderBy: { createdAt: 'desc' } }),
        ]);
        return {
          env: env.APP_ENV,
          version: '0.1.0',
          counts: { users, publishedContents: contents, orders },
          lastDeployAt: lastDeploy?.createdAt ?? null,
          services: { api: 'up', db: 'connected', redis: env.REDIS_URL ? 'configured' : 'not-configured' },
        };
      }
      case 'deploy': {
        const target = String(p.target ?? 'all');
        if (!['web', 'api', 'all'].includes(target)) throw new Error('target must be web / api / all');
        return { queued: true, target, note: 'P1: deploy platform API (Zeabur) not wired yet; recorded in audit' };
      }
      case 'migrate':
        return { queued: true, note: 'P1: run `npm run db:migrate` on the api service; recorded in audit' };
      case 'get_settings': {
        const rows = await this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
        return Object.fromEntries(rows.map((r) => [r.key, r.isSecret ? '****' : r.value]));
      }
      case 'update_settings': {
        const entries = Object.entries((p.settings as Record<string, unknown>) ?? {});
        if (!entries.length) throw new Error('settings must not be empty');
        for (const [key, v] of entries) {
          const value = String(v);
          await this.prisma.setting.upsert({
            where: { key },
            update: { value },
            create: { key, value, isSecret: SECRET_KEY.test(key) },
          });
        }
        return { updated: entries.map(([k]) => k) };
      }
      case 'import_content':
        return this.migration.run(p);
      case 'audit': {
        const rows = await this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(Number(p.limit ?? 50), 200) });
        return rows;
      }
    }
  }
}

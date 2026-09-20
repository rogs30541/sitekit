import { BadRequestException, Injectable } from '@nestjs/common';
import { OPS_ACTIONS, OPS_ACTION_KEYS, type OpsAction, type OpsResult } from '@sitekit/shared';
import { env } from '../../config/env';

/**
 * 後台維運執行層：MCP 路徑與 AI API 路徑共用的唯一入口。
 * 骨架版：設定與稽核存記憶體；正式版改接 Prisma（settings / audit_logs）與部署平台 API。
 */
@Injectable()
export class OpsService {
  private settings: Record<string, string> = {
    'brand.name': 'SiteKit',
    'storage.driver': 'local',
    'payment.provider': 'none',
  };
  private audit: OpsResult[] = [];
  private deployCounter = 0;

  listActions() {
    return OPS_ACTION_KEYS.map((k) => ({ action: k, ...OPS_ACTIONS[k] }));
  }

  async run(action: string, params: Record<string, unknown> | undefined, actor: string): Promise<OpsResult> {
    if (!OPS_ACTION_KEYS.includes(action as OpsAction)) throw new BadRequestException('unknown action: ' + action);
    const base = { action: action as OpsAction, actor, at: new Date().toISOString() };
    try {
      const data = await this.execute(action as OpsAction, params ?? {});
      const r: OpsResult = { ok: true, ...base, data };
      if (OPS_ACTIONS[action as OpsAction].mutating) this.audit.push(r);
      return r;
    } catch (e) {
      const r: OpsResult = { ok: false, ...base, error: e instanceof Error ? e.message : String(e) };
      this.audit.push(r);
      return r;
    }
  }

  private async execute(action: OpsAction, p: Record<string, unknown>): Promise<unknown> {
    switch (action) {
      case 'status':
        return {
          env: env.APP_ENV,
          version: '0.1.0',
          deploys: this.deployCounter,
          services: {
            api: 'up',
            db: env.DATABASE_URL ? 'configured' : 'not-configured',
            redis: env.REDIS_URL ? 'configured' : 'not-configured',
          },
        };
      case 'deploy': {
        const target = String(p.target ?? 'all');
        if (!['web', 'api', 'all'].includes(target)) throw new Error('target must be web / api / all');
        this.deployCounter += 1;
        return { queued: true, target, note: 'skeleton: deploy platform API (Zeabur) not wired yet' };
      }
      case 'migrate':
        return { queued: true, note: 'skeleton: production runs prisma migrate deploy' };
      case 'get_settings':
        return Object.fromEntries(
          Object.entries(this.settings).map(([k, v]) => [k, /secret|key|token/i.test(k) ? '****' : v]),
        );
      case 'update_settings': {
        const entries = Object.entries((p.settings as Record<string, string>) ?? {});
        if (!entries.length) throw new Error('settings must not be empty');
        for (const [k, v] of entries) this.settings[k] = String(v);
        return { updated: entries.map(([k]) => k) };
      }
      case 'import_content': {
        const source = String(p.source ?? '');
        if (!['wordpress', 'csv'].includes(source)) throw new Error('source must be wordpress / csv');
        return { queued: true, source, dryRun: p.dryRun !== false, note: 'skeleton: production runs migration module idempotent upsert' };
      }
      case 'audit':
        return this.audit.slice(-Number(p.limit ?? 50));
    }
  }
}

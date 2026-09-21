import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OPS_ACTIONS, OPS_ACTION_KEYS, type OpsAction, type OpsResult } from '@sitekit/shared';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { MigrationService } from '../migration/migration.service';
import { SettingsService } from '../settings/settings.service';
import { CreditsService } from '../credits/credits.service';
import { CatalogService } from '../catalog/catalog.service';
import { CouponsService } from '../orders/coupons.service';
import { OrdersService } from '../orders/orders.service';
import { ReportsService } from '../orders/reports.service';

const SECRET_KEY = /secret|key|token|password|hashiv|hash_iv|signing/i;

/**
 * 後台維運執行層：MCP 路徑與 AI API 路徑共用的唯一入口。
 * 設定存 settings 表、每次會改動狀態的操作都寫 audit_logs。
 */
@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly migration: MigrationService,
    private readonly settings: SettingsService,
    private readonly credits: CreditsService,
    private readonly orders: OrdersService,
    private readonly coupons: CouponsService,
    private readonly reports: ReportsService,
    private readonly catalog: CatalogService,
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
    const safeParams: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (k === 'csv') safeParams[k] = '<csv omitted>';
      else if (k === 'settings' && v && typeof v === 'object') safeParams[k] = Object.fromEntries(Object.keys(v as object).map((key) => [key, SECRET_KEY.test(key) ? '****' : (v as Record<string, unknown>)[key]]));
      else safeParams[k] = v;
    }
    await this.prisma.auditLog.create({
      data: { actor, action, ok, error, params: safeParams as Prisma.InputJsonValue, result: (result ?? null) as Prisma.InputJsonValue },
    });
  }

  private async execute(action: OpsAction, p: Record<string, unknown>): Promise<unknown> {
    switch (action) {
      case 'status': {
        const [users, contents, orders, paid, lastDeploy, provider, paymentMethods] = await Promise.all([
          this.prisma.user.count(),
          this.prisma.content.count({ where: { status: 'published' } }),
          this.prisma.order.count(),
          this.prisma.order.count({ where: { status: 'paid' } }),
          this.prisma.auditLog.findFirst({ where: { action: 'deploy', ok: true }, orderBy: { createdAt: 'desc' } }),
          this.settings.paymentProvider(),
          this.settings.paymentMethods(),
        ]);
        return {
          env: env.APP_ENV,
          version: '0.2.0',
          counts: { users, publishedContents: contents, orders, paidOrders: paid },
          paymentProvider: provider,
          paymentMethods,
          lastDeployAt: lastDeploy?.createdAt ?? null,
          services: { api: 'up', db: 'connected', redis: env.REDIS_URL ? 'configured' : 'not-configured' },
        };
      }
      case 'deploy': {
        const target = String(p.target ?? 'all');
        if (!['web', 'api', 'all'].includes(target)) throw new Error('target must be web / api / all');
        return { queued: true, target, note: 'deploy platform API (Zeabur) not wired yet; recorded in audit' };
      }
      case 'migrate':
        return { queued: true, note: 'run `npm run db:migrate` on the api service; recorded in audit' };
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
        this.settings.invalidate();
        return { updated: entries.map(([k]) => k) };
      }
      case 'import_content':
        return this.migration.run(p);
      case 'adjust_credits': {
        const amount = Number(p.amount);
        if (!Number.isInteger(amount) || amount === 0) throw new Error('amount must be a non-zero integer');
        const user = await this.credits.findUser(String(p.userId ?? p.email ?? ''));
        const r = await this.credits.adjust(user.id, amount, String(p.reason ?? 'ops adjust'), 'ops');
        return { userId: user.id, email: user.email, ...r };
      }
      case 'audit': {
        const rows = await this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(Number(p.limit ?? 50), 200) });
        return rows;
      }
      case 'sales_report':
        return this.reports.sales(p);
      case 'update_shipping': {
        const orderNo = String(p.orderNo ?? p.merchantOrderNo ?? p.orderId ?? '');
        if (!orderNo) throw new Error('orderNo is required');
        const o = await this.orders.updateShipping(orderNo, { status: p.status, carrier: p.carrier ?? undefined, trackingNo: p.trackingNo ?? undefined });
        return { merchantOrderNo: o.merchantOrderNo, shippingStatus: o.shippingStatus, carrier: o.carrier, trackingNo: o.trackingNo, shippedAt: o.shippedAt };
      }
      case 'manage_coupon': {
        const op = String(p.op ?? 'create');
        if (op === 'create') return this.coupons.create(p);
        const code = String(p.code ?? p.id ?? '');
        if (!code) throw new Error('code is required');
        if (op === 'disable') return this.coupons.update(code, { isActive: false });
        if (op === 'update') {
          const { op: _op, code: _code, ...rest } = p;
          return this.coupons.update(code, rest);
        }
        throw new Error('op must be create | update | disable');
      }
      case 'adjust_stock': {
        const ref = String(p.sku ?? p.productId ?? '');
        if (!ref) throw new Error('sku or productId is required');
        if (p.set === undefined && p.delta === undefined) throw new Error('set or delta is required');
        return this.catalog.adjustStock(ref, p.set === undefined ? undefined : p.set === null ? null : Number(p.set), p.delta === undefined ? undefined : Number(p.delta));
      }
      case 'expire_orders':
        return this.orders.expirePending(p.hours === undefined ? undefined : Number(p.hours));
      case 'import_products':
        return this.migration.runProducts(p);
    }
  }
}

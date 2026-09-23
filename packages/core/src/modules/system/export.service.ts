import { Prisma, PrismaClient } from '@prisma/client';
import { BadRequestException, Injectable, Logger } from '../../compat';
import { env } from '../../env';

/**
 * 完整匯出／匯入（v0.24.0）：整個資料庫的 JSON 快照（所有 34 個模型），用途＝備份、搬家（SQLite ↔ PostgreSQL、換主機）、還原。
 * - 依 Prisma DMMF 自動列出模型與關聯，拓撲排序決定匯入順序（自我關聯依父子深度分批），改模型不用改這裡
 * - 值原樣走 JSON：Date→ISO 字串、Decimal→字串、Json／陣列→物件（SQLite 轉換層已 parse）；匯入時 Prisma 接受 ISO／字串
 * - 上傳檔案不在 JSON 內（本機 storage 目錄請一併複製；R2 在外部）
 * - 匯入 mode=replace：反向順序清空所有表再依序寫入（只給還原／搬家用，必 confirm）
 */
export interface ExportBundle {
  kind: 'sitekit-export';
  format: 1;
  version: string;
  generatedAt: string;
  includeSecrets: boolean;
  models: string[];
  counts: Record<string, number>;
  tables: Record<string, Record<string, unknown>[]>;
}
interface ModelMeta {
  name: string;
  delegate: string;
  deps: string[];
  selfParent: string | null;
  scalarFields: string[];
}
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const SECRET = /secret|key|token|password|hashiv|hash_iv|signing/i;

@Injectable()
export class ExportService {
  private readonly log = new Logger('Export');
  constructor(private readonly prisma: PrismaClient) {}

  /** 模型中繼資料（依 DMMF），依相依性拓撲排序 */
  models(): ModelMeta[] {
    const metas: ModelMeta[] = Prisma.dmmf.datamodel.models.map((m) => {
      const deps = new Set<string>();
      let selfParent: string | null = null;
      for (const f of m.fields) {
        if (f.kind !== 'object' || f.isList || !f.relationFromFields?.length) continue;
        if (f.type === m.name) selfParent = f.relationFromFields[0];
        else deps.add(f.type);
      }
      return { name: m.name, delegate: lowerFirst(m.name), deps: [...deps], selfParent, scalarFields: m.fields.filter((f) => f.kind !== 'object').map((f) => f.name) };
    });
    const byName = new Map(metas.map((m) => [m.name, m]));
    const out: ModelMeta[] = [];
    const seen = new Set<string>();
    const visit = (n: string, stack: string[]) => {
      if (seen.has(n)) return;
      if (stack.includes(n)) return; // 循環（少見）：先放進去，匯入時靠 FK 延遲或忽略
      const m = byName.get(n);
      if (!m) return;
      for (const d of m.deps) visit(d, [...stack, n]);
      seen.add(n);
      out.push(m);
    };
    for (const m of metas) visit(m.name, []);
    return out;
  }

  private delegate(name: string) {
    return (this.prisma as unknown as Record<string, { findMany: (a?: unknown) => Promise<Record<string, unknown>[]>; createMany: (a: unknown) => Promise<unknown>; deleteMany: (a?: unknown) => Promise<unknown>; count: () => Promise<number> }>)[name];
  }

  async exportAll(opts: { includeSecrets?: boolean } = {}): Promise<ExportBundle> {
    const includeSecrets = !!opts.includeSecrets;
    const order = this.models();
    const tables: Record<string, Record<string, unknown>[]> = {};
    const counts: Record<string, number> = {};
    for (const m of order) {
      let rows = await this.delegate(m.delegate).findMany();
      if (m.name === 'Setting' && !includeSecrets) rows = rows.map((r) => ((r.isSecret as boolean) || SECRET.test(String(r.key)) ? { ...r, value: '' } : r));
      if (!includeSecrets && (m.name === 'User' || m.name === 'AdminUser')) rows = rows.map((r) => ({ ...r, passwordHash: null }));
      if (!includeSecrets && m.name === 'UserApiKey') rows = [];
      tables[m.name] = rows;
      counts[m.name] = rows.length;
    }
    return { kind: 'sitekit-export', format: 1, version: env.APP_VERSION, generatedAt: new Date().toISOString(), includeSecrets, models: order.map((m) => m.name), counts, tables };
  }

  /** 依父子深度分批（自我關聯） */
  private batchesBySelfParent(rows: Record<string, unknown>[], parentKey: string) {
    const batches: Record<string, unknown>[][] = [];
    const done = new Set<string>();
    let remaining = rows;
    while (remaining.length) {
      const ready = remaining.filter((r) => r[parentKey] == null || done.has(String(r[parentKey])));
      if (!ready.length) {
        batches.push(remaining); // 孤兒：一起塞，讓 FK 報錯而不是無限迴圈
        break;
      }
      batches.push(ready);
      for (const r of ready) done.add(String(r.id));
      remaining = remaining.filter((r) => !ready.includes(r));
    }
    return batches;
  }

  async importAll(bundle: unknown, opts: { mode?: 'replace'; confirm?: boolean; actor?: string } = {}) {
    const b = bundle as Partial<ExportBundle>;
    if (!b || b.kind !== 'sitekit-export' || !b.tables) throw new BadRequestException('不是 SiteKit 匯出檔（kind 應為 sitekit-export）');
    if (!opts.confirm) throw new BadRequestException('匯入會清空並覆蓋整個資料庫，必須 confirm=true');
    const order = this.models();
    const known = new Set(order.map((m) => m.name));
    const unknown = Object.keys(b.tables).filter((k) => !known.has(k));
    const counts: Record<string, number> = {};
    const t0 = Date.now();
    await this.prisma.$transaction(
      async (tx) => {
        const del = (name: string) => (tx as unknown as Record<string, { deleteMany: (a?: unknown) => Promise<unknown> }>)[name];
        const ins = (name: string) => (tx as unknown as Record<string, { createMany: (a: unknown) => Promise<unknown> }>)[name];
        for (const m of [...order].reverse()) await del(m.delegate).deleteMany({});
        for (const m of order) {
          const rows = (b.tables?.[m.name] ?? []).map((r) => {
            const o: Record<string, unknown> = {};
            for (const f of m.scalarFields) if (f in r) o[f] = r[f];
            return o;
          });
          counts[m.name] = rows.length;
          if (!rows.length) continue;
          const batches = m.selfParent ? this.batchesBySelfParent(rows, m.selfParent) : [rows];
          for (const batch of batches) for (let i = 0; i < batch.length; i += 500) await ins(m.delegate).createMany({ data: batch.slice(i, i + 500) });
        }
      },
      { timeout: 10 * 60_000, maxWait: 30_000 },
    );
    this.log.log(`匯入完成（${opts.actor ?? 'system'}）：${Object.values(counts).reduce((a, c) => a + c, 0)} 列、${Date.now() - t0} ms`);
    return { ok: true, counts, ignoredModels: unknown, ms: Date.now() - t0, sourceVersion: b.version ?? null };
  }
}

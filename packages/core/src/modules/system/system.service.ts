import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { BadRequestException, ForbiddenException, Injectable, Logger } from '../../compat';
import { configureCore, env } from '../../env';
import { SettingsService } from '../settings/settings.service';
import { RevalidateService } from '../settings/revalidate.service';
import { StorageService } from '../storage/storage.service';
import { NotifyService } from '../notify/notify.service';
import { AdminAuthService } from '../admin-auth/admin-auth.service';

/** 系統層設定鍵（不進 SETTING_KEYS：不給後台表單改） */
export const SYSTEM_KEYS = { sessionSecret: 'system.sessionSecret', opsToken: 'system.opsToken', setupCompletedAt: 'setup.completedAt' } as const;
type Source = 'env' | 'generated';
export interface UpdateCheck {
  current: string;
  latest: string | null;
  hasUpdate: boolean;
  url: string | null;
  publishedAt?: string | null;
  notes?: string;
  checkedAt: string;
  error?: string;
  disabled?: boolean;
}
const cmpVer = (a: string, b: string) => {
  const pa = a.split(/[.-]/).map((x) => (Number.isFinite(Number(x)) ? Number(x) : 0));
  const pb = b.split(/[.-]/).map((x) => (Number.isFinite(Number(x)) ? Number(x) : 0));
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

/**
 * 交付化地基（v0.19.0）：任何人獨自部署時第一天要用到的東西。
 * - ensureSecrets：SESSION_SECRET／OPS_TOKEN 沒由環境變數提供時，首次啟動自動產生並存進 settings（重啟不變、sessions 與加密資料不失效）
 * - setup：安裝精靈狀態、建立第一位超級管理員（admin_users 為空時免 Email 驗證）、標記完成
 * - health：DB／儲存讀寫／Email／公開網址可達／發佈即清快取，一次看完
 * - supportBundle：去識別化的設定＋最近稽核＋健康檢查，給支援排障
 */
@Injectable()
export class SystemService {
  private readonly log = new Logger('System');
  private sources: Record<'sessionSecret' | 'opsToken', Source> = { sessionSecret: 'env', opsToken: 'env' };

  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
    private readonly notify: NotifyService,
    private readonly reval: RevalidateService,
    private readonly admins: AdminAuthService,
  ) {}

  private async getOrCreateSecret(key: string, bytes: number) {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (row?.value) return { value: row.value, created: false };
    const value = randomBytes(bytes).toString('base64url');
    await this.prisma.setting.upsert({ where: { key }, update: { value, isSecret: true }, create: { key, value, isSecret: true } });
    return { value, created: true };
  }

  /** 啟動時呼叫：沒給的機密自動產生並注入 core env */
  async ensureSecrets() {
    if (env.SESSION_SECRET === 'dev-only-secret') {
      const s = await this.getOrCreateSecret(SYSTEM_KEYS.sessionSecret, 48);
      configureCore({ SESSION_SECRET: s.value });
      this.sources.sessionSecret = 'generated';
      this.log.log(`SESSION_SECRET 未由環境變數提供，${s.created ? '已自動產生' : '沿用'}資料庫中的密鑰`);
    }
    if (!env.OPS_TOKEN) {
      const t = await this.getOrCreateSecret(SYSTEM_KEYS.opsToken, 32);
      configureCore({ OPS_TOKEN: t.value });
      this.sources.opsToken = 'generated';
      this.log.log(`OPS_TOKEN 未由環境變數提供，${t.created ? '已自動產生' : '沿用'}資料庫中的 token（後台「系統設定 → 健康檢查」可看）`);
    }
    return { ...this.sources };
  }

  /* ---------- 安裝精靈 ---------- */
  async setupStatus() {
    const [adminCount, completed] = await Promise.all([this.admins.count(), this.settings.get(SYSTEM_KEYS.setupCompletedAt)]);
    return { needsSetup: adminCount === 0, completed: !!completed, completedAt: completed || null, version: env.APP_VERSION };
  }
  /** admin_users 為空時才允許（誰先到全新站台誰就是站長，與 WordPress 同）；之後一律走登入頁／白名單註冊 */
  async createFirstAdmin(input: unknown) {
    if ((await this.admins.count()) > 0) throw new ForbiddenException('已有管理員，請由 /admin/login 登入');
    return this.admins.bootstrap(input);
  }
  async completeSetup(actor: string) {
    const at = new Date().toISOString();
    await this.prisma.setting.upsert({ where: { key: SYSTEM_KEYS.setupCompletedAt }, update: { value: at }, create: { key: SYSTEM_KEYS.setupCompletedAt, value: at, isSecret: false } });
    this.settings.invalidate();
    await this.prisma.auditLog.create({ data: { actor, action: 'setup_complete', ok: true, params: {}, result: { at } } });
    return { ok: true, completedAt: at };
  }

  /* ---------- 健康檢查 ---------- */
  async health() {
    const t0 = Date.now();
    const db = await this.prisma
      .$queryRaw`SELECT 1`.then(() => ({ ok: true as const, ms: Date.now() - t0 }))
      .catch((e: unknown) => ({ ok: false as const, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) }));
    const storage = await (async () => {
      const cfg = await this.storage.config();
      try {
        const probe = `health-probe ${new Date().toISOString()}`;
        const put = await this.storage.put('system/health-probe.txt', Buffer.from(probe), 'text/plain');
        const back = await this.storage.fetchAsset(put.url, 1024 * 64);
        const ok = !!back && back.bytes.toString('utf8') === probe;
        return { ok, driver: cfg.driver, s3Ready: cfg.s3Ready, url: put.url, ...(ok ? {} : { error: back ? '讀回內容不符' : '寫入後讀不回（本機磁碟路徑或 R2 公開網址設定有誤）' }) };
      } catch (e) {
        return { ok: false, driver: cfg.driver, s3Ready: cfg.s3Ready, error: e instanceof Error ? e.message : String(e) };
      }
    })();
    const email = await this.notify.config().then((c) => ({ ok: c.emailProvider === 'resend', provider: c.emailProvider, from: c.from, adminTo: c.adminTo, lineConfigured: c.lineConfigured, hint: c.emailProvider === 'resend' ? undefined : 'Email 供應商是 log（只寫日誌不寄信）：管理員註冊驗證碼、忘記密碼、訂單通知都寄不出去，請到「儲存與通知」填 Resend' }));
    const siteUrl = await this.settings.siteUrl();
    const site = await fetch(`${siteUrl}/api/health`, { signal: AbortSignal.timeout(5000) })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; version?: string };
        return { ok: r.status === 200 && !!j.ok, url: siteUrl, status: r.status, version: j.version, ...(r.status === 200 && j.ok ? {} : { error: '公開網址打不到 api（site.url 是否正確、反向代理是否把 /api 轉給 api）' }) };
      })
      .catch((e: unknown) => ({ ok: false, url: siteUrl, status: 0, error: `無法連線：${e instanceof Error ? e.message : String(e)}（金流回呼與 MCP 都會失敗）` }));
    const revalidate = await fetch(`${siteUrl}/sitekit-internal/revalidate`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sitekit-token': this.reval.token() }, body: JSON.stringify({ reason: 'health' }), signal: AbortSignal.timeout(5000) })
      .then((r) => ({ ok: r.status === 200, status: r.status, ...(r.status === 200 ? {} : { error: r.status === 404 ? 'web 版本過舊（沒有 /sitekit-internal/revalidate）' : r.status === 401 ? 'token 驗證失敗（web 與 api 的 SESSION_SECRET 不一致，或 web 打不到 api）' : `HTTP ${r.status}` }) }))
      .catch((e: unknown) => ({ ok: false, status: 0, error: e instanceof Error ? e.message : String(e) }));
    const payment = await this.settings.paymentMethods().then((m) => ({ ok: m.length > 0, methods: m, hint: m.length ? undefined : '尚未啟用任何付款方式（測試可用 mock；正式到「帳務 → 金流」設定）' }));
    return {
      at: new Date().toISOString(),
      version: env.APP_VERSION,
      appEnv: env.APP_ENV,
      node: typeof process !== 'undefined' ? process.version : 'n/a',
      db,
      storage,
      email,
      site,
      revalidate,
      payment,
      secrets: { sessionSecret: this.sources.sessionSecret, opsToken: this.sources.opsToken, opsTokenConfigured: !!env.OPS_TOKEN },
      ok: db.ok && storage.ok && site.ok,
    };
  }

  /** 支援包：機密全部遮蔽 */
  async supportBundle() {
    const [rows, audit, users, adminUsers, orders, contents, health] = await Promise.all([
      this.prisma.setting.findMany({ orderBy: { key: 'asc' } }),
      this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: { actor: true, action: true, ok: true, error: true, createdAt: true } }),
      this.prisma.user.count(),
      this.prisma.adminUser.count(),
      this.prisma.order.count(),
      this.prisma.content.count(),
      this.health(),
    ]);
    const mask = (k: string, v: string, secret: boolean) => (secret || /secret|key|token|password|hashiv|hash_iv|signing/i.test(k) ? (v ? `****(${v.length})` : '') : v);
    return {
      generatedAt: new Date().toISOString(),
      version: env.APP_VERSION,
      appEnv: env.APP_ENV,
      node: typeof process !== 'undefined' ? process.version : 'n/a',
      platform: typeof process !== 'undefined' ? `${process.platform}/${process.arch}` : 'n/a',
      counts: { users, adminUsers, orders, contents },
      settings: Object.fromEntries(rows.map((r) => [r.key, mask(r.key, r.value, r.isSecret)])),
      health,
      audit,
    };
  }

  /* ---------- 版本更新檢查（GitHub Releases；6 小時快取；失敗靜默） ---------- */
  private updateCache: { at: number; value: UpdateCheck } | null = null;
  async updateCheck(force = false): Promise<UpdateCheck> {
    const current = env.APP_VERSION;
    const repo = env.UPDATE_REPO;
    if (!repo) return { current, latest: null, hasUpdate: false, url: null, checkedAt: new Date().toISOString(), disabled: true };
    if (!force && this.updateCache && Date.now() - this.updateCache.at < 6 * 3600_000) return this.updateCache.value;
    let value: UpdateCheck;
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': `sitekit/${current}` }, signal: AbortSignal.timeout(6000) });
      if (!r.ok) throw new Error(`GitHub ${r.status}（私有 repo 未公開時檢查不到）`);
      const j = (await r.json()) as { tag_name?: string; html_url?: string; published_at?: string; body?: string };
      const latest = (j.tag_name ?? '').replace(/^v/, '') || null;
      value = { current, latest, hasUpdate: !!latest && cmpVer(latest, current) > 0, url: j.html_url ?? null, publishedAt: j.published_at ?? null, notes: (j.body ?? '').slice(0, 2000), checkedAt: new Date().toISOString() };
    } catch (e) {
      value = { current, latest: null, hasUpdate: false, url: null, checkedAt: new Date().toISOString(), error: e instanceof Error ? e.message : String(e) };
    }
    this.updateCache = { at: Date.now(), value };
    return value;
  }

  /* ---------- OPS token（MCP 連接用） ---------- */
  opsToken() {
    return { token: env.OPS_TOKEN ?? null, source: this.sources.opsToken };
  }
  async rotateOpsToken(actor: string) {
    if (this.sources.opsToken === 'env') throw new BadRequestException('OPS_TOKEN 由環境變數提供，請到部署平台的環境變數修改後重啟');
    const value = randomBytes(32).toString('base64url');
    await this.prisma.setting.upsert({ where: { key: SYSTEM_KEYS.opsToken }, update: { value, isSecret: true }, create: { key: SYSTEM_KEYS.opsToken, value, isSecret: true } });
    configureCore({ OPS_TOKEN: value });
    await this.prisma.auditLog.create({ data: { actor, action: 'rotate_ops_token', ok: true, params: {} } });
    return { token: value, source: 'generated' as const };
  }
}

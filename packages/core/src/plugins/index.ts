/**
 * 外掛機制（1.1）：建置期載入的 npm 套件（sitekit.config.mjs 或 SITEKIT_PLUGINS 列出），不做執行期動態載入。
 * 外掛能做三件事：
 *  1. 訂閱事件（events.on）：order.paid／order.shipped／order.refunded／user.registered／content.published／sales_page.published／question.created／setup.completed
 *  2. 註冊 OPS 動作（ctx.registerAction）：自動出現在 /api/ops/actions、MCP 工具、後台 AI API 路徑，走同一套稽核
 *  3. 宣告設定欄位（plugin.settings）：後台「外掛」頁自動長出表單，值存 settings 表（key 含 secret/key/token 自動遮蔽）
 * 核心只 emit 事件、不知道外掛存在；外掛壞了只記 warn，不影響站台。
 */
import type { PrismaClient } from '@prisma/client';
import { Logger } from '../compat';

export type EventPayload = Record<string, unknown>;
export type EventHandler = (payload: EventPayload, event: string) => unknown | Promise<unknown>;

export class EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();
  private readonly log = new Logger('Events');
  on(event: string, handler: EventHandler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return () => this.off(event, handler);
  }
  off(event: string, handler: EventHandler) {
    this.handlers.set(event, (this.handlers.get(event) ?? []).filter((h) => h !== handler));
  }
  listeners(event: string) {
    return [...(this.handlers.get(event) ?? []), ...(this.handlers.get('*') ?? [])];
  }
  /** fire-and-forget：每個 handler 各自 try/catch，慢或壞的外掛不影響主流程 */
  emit(event: string, payload: EventPayload) {
    const hs = this.listeners(event);
    if (!hs.length) return Promise.resolve();
    return Promise.allSettled(
      hs.map(async (h) => {
        try {
          await h(payload, event);
        } catch (e) {
          this.log.warn(`handler for ${event} failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }),
    ).then(() => undefined);
  }
}

export interface PluginSettingField {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  help?: string;
}
export interface PluginActionDef {
  desc: string;
  mutating: boolean;
  handler: (params: Record<string, unknown>, actor: string) => Promise<unknown> | unknown;
}
export interface PluginContext {
  events: EventBus;
  prisma: PrismaClient;
  settings: { get(key: string, def?: string): Promise<string>; siteUrl(): Promise<string> };
  log: Logger;
  registerAction(name: string, def: PluginActionDef): void;
}
export interface SiteKitPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  settings?: PluginSettingField[];
  register(ctx: PluginContext): void | Promise<void>;
}
export interface RegisteredPlugin {
  id: string;
  name: string;
  version: string;
  description?: string;
  settings: PluginSettingField[];
  actions: string[];
  module: string;
  error?: string;
}

export const events = new EventBus();

class PluginRegistry {
  readonly plugins: RegisteredPlugin[] = [];
  readonly actions = new Map<string, PluginActionDef & { plugin: string }>();
  private readonly log = new Logger('Plugins');

  async register(plugin: SiteKitPlugin, moduleName: string, deps: { prisma: PrismaClient; settings: PluginContext['settings'] }) {
    if (!plugin || typeof plugin.register !== 'function' || !plugin.id) throw new Error(`${moduleName}：不是合法的 SiteKit 外掛（需要 id 與 register()）`);
    if (this.plugins.some((p) => p.id === plugin.id)) throw new Error(`外掛 id 重複：${plugin.id}`);
    const entry: RegisteredPlugin = { id: plugin.id, name: plugin.name ?? plugin.id, version: plugin.version ?? '0.0.0', description: plugin.description, settings: plugin.settings ?? [], actions: [], module: moduleName };
    const ctx: PluginContext = {
      events,
      prisma: deps.prisma,
      settings: deps.settings,
      log: new Logger(`plugin:${plugin.id}`),
      registerAction: (name, def) => {
        if (!/^[a-z][a-z0-9_]{2,60}$/.test(name)) throw new Error(`動作名稱不合法：${name}`);
        if (this.actions.has(name)) throw new Error(`動作已存在：${name}`);
        this.actions.set(name, { ...def, plugin: plugin.id });
        entry.actions.push(name);
      },
    };
    await plugin.register(ctx);
    this.plugins.push(entry);
    this.log.log(`已載入 ${entry.id}@${entry.version}（${entry.actions.length} 個動作、${entry.settings.length} 個設定）`);
    return entry;
  }
  /** 載入失敗也留一筆讓後台看得到 */
  markFailed(moduleName: string, error: string) {
    this.plugins.push({ id: moduleName, name: moduleName, version: '?', settings: [], actions: [], module: moduleName, error });
    this.log.warn(`載入 ${moduleName} 失敗：${error}`);
  }
  list() {
    return this.plugins.map((p) => ({ ...p }));
  }
}
export const pluginRegistry = new PluginRegistry();

/** 給外掛作者用：型別提示而已 */
export const definePlugin = (p: SiteKitPlugin) => p;

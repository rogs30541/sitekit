/**
 * 迷你 DI 容器：讀 Nest 的 @Module／@Injectable 中繼資料（reflect-metadata），在 Cloudflare Workers 上把
 * apps/api 的 module 圖原封不動組起來——controller／service 一行不改。
 * 支援：class provider、{ provide, useClass|useValue|useExisting|useFactory(+inject) }、模組 imports 遞迴、@Global。
 * 不支援（本專案沒用到）：@Inject 自訂 token、forwardRef、request-scoped、屬性注入。
 */
import 'reflect-metadata';

type Ctor<T = unknown> = new (...args: never[]) => T;
type Token = Ctor | string | symbol;
interface ProviderObj {
  provide: Token;
  useClass?: Ctor;
  useValue?: unknown;
  useExisting?: Token;
  useFactory?: (...a: unknown[]) => unknown;
  inject?: Token[];
}
type Provider = Ctor | ProviderObj;

export class Container {
  private readonly instances = new Map<Token, unknown>();
  private readonly providers = new Map<Token, Provider>();
  private readonly pending = new Set<Token>();
  readonly controllers: Ctor[] = [];
  readonly modules: Ctor[] = [];

  /** 預先放入的實例（例：D1 版 PrismaClient）——同 token 的 module provider 會被略過 */
  preset(token: Token, value: unknown) {
    this.instances.set(token, value);
  }

  /** 走訪 module 圖，收集 providers／controllers */
  register(mod: Ctor, seen = new Set<Ctor>()) {
    if (seen.has(mod)) return;
    seen.add(mod);
    this.modules.push(mod);
    for (const m of (Reflect.getMetadata('imports', mod) as Ctor[] | undefined) ?? []) this.register(m, seen);
    for (const p of (Reflect.getMetadata('providers', mod) as Provider[] | undefined) ?? []) {
      const token = typeof p === 'function' ? p : p.provide;
      if (!this.providers.has(token)) this.providers.set(token, p);
    }
    for (const c of (Reflect.getMetadata('controllers', mod) as Ctor[] | undefined) ?? []) if (!this.controllers.includes(c)) this.controllers.push(c);
  }

  async get<T>(token: Token): Promise<T> {
    if (this.instances.has(token)) return this.instances.get(token) as T;
    if (this.pending.has(token)) throw new Error(`circular dependency on ${String((token as Ctor).name ?? token)}`);
    this.pending.add(token);
    try {
      const p = this.providers.get(token);
      let value: unknown;
      if (!p) {
        if (typeof token !== 'function') throw new Error(`no provider for ${String(token)}`);
        value = await this.construct(token);
      } else if (typeof p === 'function') value = await this.construct(p);
      else if ('useValue' in p) value = p.useValue;
      else if (p.useExisting) value = await this.get(p.useExisting);
      else if (p.useFactory) value = await p.useFactory(...(await Promise.all((p.inject ?? []).map((t) => this.get(t)))));
      else if (p.useClass) value = await this.construct(p.useClass);
      else throw new Error(`unsupported provider for ${String(token)}`);
      this.instances.set(token, value);
      return value as T;
    } finally {
      this.pending.delete(token);
    }
  }

  /** 依 design:paramtypes（emitDecoratorMetadata）遞迴解析建構子參數 */
  private async construct(cls: Ctor): Promise<unknown> {
    const types = (Reflect.getMetadata('design:paramtypes', cls) as Token[] | undefined) ?? [];
    const args = await Promise.all(types.map((t, i) => this.get(t).catch((e: Error) => { throw new Error(`${cls.name} arg#${i}: ${e.message}`); })));
    return new cls(...(args as never[]));
  }

  /** 已實例化的 provider 中呼叫 onModuleInit（只對「有此方法」的物件） */
  async runInit(skip: (name: string) => boolean = () => false) {
    for (const [token, inst] of this.instances) {
      const name = typeof token === 'function' ? token.name : String(token);
      if (skip(name)) continue;
      const fn = (inst as { onModuleInit?: () => unknown } | null)?.onModuleInit;
      if (typeof fn === 'function') await fn.call(inst);
    }
  }
}

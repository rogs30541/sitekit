/**
 * 前台→api 的伺服器端 fetch 單一入口。
 * - Node／Docker／Zeabur：一般 fetch 到 API_INTERNAL_URL。
 * - Cloudflare Workers（OpenNext）：同帳號 workers.dev 之間不能互相 fetch（同 zone 會被擋／掛住），
 *   改走 Service Binding `env.API`（apps/web/wrangler.jsonc services），從 OpenNext 放在 globalThis 的 context 取得，不 import 套件。
 */
type CfContext = { env?: Record<string, unknown> };
type Fetcher = { fetch: (input: Request) => Promise<Response> };

function apiBinding(): Fetcher | null {
  const ctx = (globalThis as unknown as Record<symbol, CfContext | undefined>)[Symbol.for('__cloudflare-context__')];
  const api = ctx?.env?.API as Fetcher | undefined;
  return api && typeof api.fetch === 'function' ? api : null;
}

/** 與 fetch 同簽名；在 Workers 上自動改走 Service Binding */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const api = apiBinding();
  if (!api) return fetch(input, init);
  const rest = { ...(init ?? {}) } as RequestInit & { next?: unknown };
  delete rest.next;
  delete rest.cache;
  return api.fetch(new Request(input, rest));
}

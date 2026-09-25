import { API_INTERNAL_URL } from '@/lib/api-public';
import { apiFetch } from '@/lib/api-fetch';

/**
 * 瀏覽器打的 /api/* 反向代理（同源 cookie、不碰 CORS）。
 * Node／Docker：next.config 的 beforeFiles rewrite 先攔，不會到這裡。
 * Cloudflare Workers（OpenNext）：沒有 rewrite（同 zone fetch 不可用），由本 handler 經 Service Binding 轉發。
 */
export const dynamic = 'force-dynamic';
const HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'te', 'trailer', 'upgrade', 'proxy-authorization', 'proxy-authenticate']);

async function proxy(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const target = `${API_INTERNAL_URL}/api/${path.map(encodeURIComponent).join('/')}${url.search}`;
  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!HOP.has(k.toLowerCase())) headers.set(k, v);
  });
  const fwd = req.headers.get('x-forwarded-for');
  headers.set('x-forwarded-for', fwd ?? (req.headers.get('cf-connecting-ip') ?? ''));
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));
  const hasBody = !['GET', 'HEAD'].includes(req.method);
  const res = await apiFetch(target, { method: req.method, headers, body: hasBody ? await req.arrayBuffer() : undefined, redirect: 'manual' });
  const out = new Headers();
  res.headers.forEach((v, k) => {
    if (!HOP.has(k.toLowerCase()) && k.toLowerCase() !== 'set-cookie') out.set(k, v);
  });
  for (const c of res.headers.getSetCookie?.() ?? []) out.append('set-cookie', c);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;

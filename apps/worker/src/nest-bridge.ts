/**
 * Nest → Hono 路由轉接器：把 apps/api 的 controller（@Controller／@Get／@Body／@UseGuards…）依 reflect-metadata 掛到 Hono，
 * 提供 Express 形狀相容的 req／res 給既有 controller 與 guard 使用（req.session、req.cookies、res.cookie、res.redirect…）。
 * 對應 Nest 的行為：class＋method guards、@HttpCode、@Header、POST 預設 201、@Res 由 controller 自己寫回、
 * HttpError／HttpException／ZodError 的 JSON 形狀與 apps/api 的 filters 一致。
 */
import 'reflect-metadata';
import type { Context, Hono } from 'hono';
import { ZodError } from 'zod';
import type { Container } from './container';

type Ctor = new (...a: never[]) => unknown;
const METHODS = ['get', 'post', 'put', 'delete', 'patch', 'all', 'options', 'head'] as const; // RequestMethod enum 順序
// RouteParamtypes enum
const P = { REQUEST: 0, RESPONSE: 1, NEXT: 2, BODY: 3, QUERY: 4, PARAM: 5, HEADERS: 6, SESSION: 7, FILE: 8, FILES: 9, HOST: 10, IP: 11 } as const;

export interface ReqShim {
  method: string;
  url: string;
  originalUrl: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string | string[]>;
  params: Record<string, string>;
  body: unknown;
  cookies: Record<string, string>;
  ip: string;
  protocol: string;
  hostname: string;
  secure: boolean;
  raw: Request;
  get(name: string): string | undefined;
  header(name: string): string | undefined;
  [k: string]: unknown;
}

interface CookieOpts { httpOnly?: boolean; secure?: boolean; sameSite?: 'lax' | 'strict' | 'none' | boolean; maxAge?: number; path?: string; domain?: string; expires?: Date }
export class ResShim {
  statusCode = 200;
  explicitStatus = false;
  headers = new Headers();
  cookies: string[] = [];
  body: string | ArrayBuffer | null = null;
  redirectTo: string | null = null;
  headersSent = false;
  writableEnded = false;
  status(code: number) { this.statusCode = code; this.explicitStatus = true; return this; }
  setHeader(n: string, v: string | number | string[]) { this.headers.set(n, Array.isArray(v) ? v.join(', ') : String(v)); return this; }
  set(n: string, v: string) { return this.setHeader(n, v); }
  header(n: string, v: string) { return this.setHeader(n, v); }
  getHeader(n: string) { return this.headers.get(n) ?? undefined; }
  type(t: string) { this.headers.set('content-type', t.includes('/') ? t : `text/${t}`); return this; }
  cookie(name: string, value: string, o: CookieOpts = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path ?? '/'}`];
    if (o.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(o.maxAge / 1000)}`);
    if (o.expires) parts.push(`Expires=${o.expires.toUTCString()}`);
    if (o.domain) parts.push(`Domain=${o.domain}`);
    if (o.httpOnly) parts.push('HttpOnly');
    if (o.secure) parts.push('Secure');
    if (o.sameSite) parts.push(`SameSite=${o.sameSite === true ? 'Strict' : o.sameSite[0].toUpperCase() + o.sameSite.slice(1)}`);
    this.cookies.push(parts.join('; '));
    return this;
  }
  clearCookie(name: string, o: CookieOpts = {}) { return this.cookie(name, '', { ...o, maxAge: 0, expires: new Date(0) }); }
  redirect(a: string | number, b?: string) {
    if (typeof a === 'number') { this.statusCode = a; this.redirectTo = b ?? '/'; } else { this.statusCode = 302; this.redirectTo = a; }
    this.headersSent = true; this.writableEnded = true; return this;
  }
  json(v: unknown) { this.headers.set('content-type', 'application/json; charset=utf-8'); this.body = JSON.stringify(v); this.headersSent = true; this.writableEnded = true; return this; }
  send(v: unknown) {
    if (v === undefined || v === null) this.body = '';
    else if (typeof v === 'string') { if (!this.headers.has('content-type')) this.headers.set('content-type', 'text/html; charset=utf-8'); this.body = v; }
    else if (v instanceof ArrayBuffer) this.body = v;
    else if (v instanceof Uint8Array) this.body = v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
    else return this.json(v);
    this.headersSent = true; this.writableEnded = true; return this;
  }
  end(v?: unknown) { if (v !== undefined) return this.send(v); this.headersSent = true; this.writableEnded = true; return this; }
  toResponse(): Response {
    const h = new Headers(this.headers);
    for (const c of this.cookies) h.append('set-cookie', c);
    if (this.redirectTo) { h.set('location', this.redirectTo); return new Response(null, { status: this.statusCode, headers: h }); }
    return new Response(this.body, { status: this.statusCode, headers: h });
  }
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function parseBody(req: Request): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const ct = req.headers.get('content-type') ?? '';
  const text = await req.text();
  if (!text) return {};
  if (ct.includes('application/json')) { try { return JSON.parse(text); } catch { return {}; } }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const out: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(text)) out[k] = v;
    return out;
  }
  return text;
}

export async function makeReq(c: Context): Promise<ReqShim> {
  const raw = c.req.raw;
  const url = new URL(raw.url);
  const headers: Record<string, string> = {};
  raw.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  const query: Record<string, string | string[]> = {};
  for (const [k, v] of url.searchParams) {
    const cur = query[k];
    query[k] = cur === undefined ? v : Array.isArray(cur) ? [...cur, v] : [cur, v];
  }
  const ip = headers['cf-connecting-ip'] ?? headers['x-forwarded-for']?.split(',')[0]?.trim() ?? '0.0.0.0';
  return {
    method: raw.method,
    url: url.pathname + url.search,
    originalUrl: url.pathname + url.search,
    path: url.pathname,
    headers,
    query,
    params: c.req.param() as Record<string, string>,
    body: await parseBody(raw.clone()),
    cookies: parseCookies(raw.headers.get('cookie')),
    ip,
    protocol: url.protocol.replace(':', ''),
    hostname: url.hostname,
    secure: url.protocol === 'https:',
    raw,
    get: (n) => headers[n.toLowerCase()],
    header: (n) => headers[n.toLowerCase()],
  };
}

/** 與 apps/api 的 HttpErrorFilter／ZodExceptionFilter／Nest 預設一致的錯誤回應 */
export function errorToResponse(e: unknown): Response {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
  if (e instanceof ZodError) return json(400, { statusCode: 400, error: 'Bad Request', message: e.flatten().fieldErrors });
  const x = e as { status?: number; toJSON?: () => unknown; getStatus?: () => number; getResponse?: () => unknown; message?: string; stack?: string };
  if (typeof x?.getStatus === 'function' && typeof x?.getResponse === 'function') {
    const r = x.getResponse();
    const status = x.getStatus();
    return json(status, typeof r === 'string' ? { statusCode: status, message: r } : r);
  }
  if (typeof x?.status === 'number' && typeof x?.toJSON === 'function') return json(x.status, x.toJSON());
  console.error('[worker] unhandled', x?.stack ?? x?.message ?? e);
  return json(500, { statusCode: 500, message: 'Internal server error' });
}

function joinPath(...parts: (string | undefined)[]): string {
  const p = '/' + parts.filter((s) => s !== undefined && s !== '').map((s) => String(s).replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
  return p.replace(/\/+/g, '/');
}

export interface MountOptions {
  prefix?: string;
  /** 掛完後回呼（給紀錄／統計） */
  onRoute?: (method: string, path: string, ctrl: string, handler: string) => void;
}

/** 把容器內全部 controller 掛到 Hono */
export async function mountControllers(app: Hono, container: Container, opts: MountOptions = {}) {
  const prefix = opts.prefix ?? '/api';
  for (const Ctrl of container.controllers) {
    const instance = (await container.get(Ctrl)) as Record<string, (...a: unknown[]) => unknown>;
    const ctrlPaths = ([] as string[]).concat((Reflect.getMetadata('path', Ctrl) as string | string[] | undefined) ?? '/');
    const classGuards = (Reflect.getMetadata('__guards__', Ctrl) as Ctor[] | undefined) ?? [];
    const proto = Ctrl.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;
      const fn = proto[name];
      if (typeof fn !== 'function') continue;
      const methodIdx = Reflect.getMetadata('method', fn) as number | undefined;
      const methodPaths = Reflect.getMetadata('path', fn) as string | string[] | undefined;
      if (methodIdx === undefined || methodPaths === undefined) continue;
      const verb = METHODS[methodIdx] ?? 'all';
      const guards = [...classGuards, ...(((Reflect.getMetadata('__guards__', fn) as Ctor[] | undefined) ?? []))];
      const args = (Reflect.getMetadata('__routeArguments__', Ctrl, name) as Record<string, { index: number; data?: string; pipes?: unknown[] }> | undefined) ?? {};
      const httpCode = Reflect.getMetadata('__httpCode__', fn) as number | undefined;
      const extraHeaders = (Reflect.getMetadata('__headers__', fn) as { name: string; value: string }[] | undefined) ?? [];
      const usesRes = Object.keys(args).some((k) => Number(k.split(':')[0]) === P.RESPONSE);
      const handler = async (c: Context) => {
        // core 的 background()：回應後的通知／事件／重新驗證交給 waitUntil，否則請求結束時被中止（並會卡住 Prisma 引擎的批次通道）
        try { (globalThis as { __sitekitWaitUntil?: (p: Promise<unknown>) => void }).__sitekitWaitUntil = (p) => c.executionCtx.waitUntil(p); } catch { /* 無 executionCtx（測試） */ }
        const req = await makeReq(c);
        const res = new ResShim();
        try {
          for (const G of guards) {
            const g = (await container.get(G)) as { canActivate: (ctx: unknown) => boolean | Promise<boolean> };
            const ctx = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res, getNext: () => () => undefined }), getHandler: () => fn, getClass: () => Ctrl, getType: () => 'http' };
            const ok = await g.canActivate(ctx);
            if (!ok) return errorToResponse({ getStatus: () => 403, getResponse: () => ({ statusCode: 403, message: 'Forbidden resource', error: 'Forbidden' }) });
          }
          const params: unknown[] = [];
          for (const [key, meta] of Object.entries(args)) {
            const type = Number(key.split(':')[0]);
            let v: unknown;
            switch (type) {
              case P.REQUEST: v = req; break;
              case P.RESPONSE: v = res; break;
              case P.BODY: v = meta.data ? (req.body as Record<string, unknown>)?.[meta.data] : req.body; break;
              case P.QUERY: v = meta.data ? req.query[meta.data] : req.query; break;
              case P.PARAM: v = meta.data ? req.params[meta.data] : req.params; break;
              case P.HEADERS: v = meta.data ? req.headers[meta.data.toLowerCase()] : req.headers; break;
              case P.IP: v = req.ip; break;
              case P.HOST: v = req.hostname; break;
              default: v = undefined;
            }
            for (const pipe of meta.pipes ?? []) {
              const inst = typeof pipe === 'function' ? new (pipe as Ctor)() : pipe;
              const t = (inst as { transform?: (v: unknown, m: unknown) => unknown }).transform;
              if (typeof t === 'function') v = await t.call(inst, v, { type: 'custom', data: meta.data });
            }
            params[meta.index] = v;
          }
          const result = await instance[name].apply(instance, params);
          for (const h of extraHeaders) res.setHeader(h.name, h.value);
          const defaultStatus = httpCode ?? (verb === 'post' ? 201 : 200);
          if (usesRes) {
            // @Res({ passthrough: true })：controller 只設 cookie／標頭、回傳值仍由框架序列化；未明確設狀態碼時用 Nest 預設
            if (!res.redirectTo && !res.explicitStatus) res.statusCode = defaultStatus;
            if (!res.headersSent && result !== undefined && result !== null) { if (typeof result === 'string') { if (!res.headers.has('content-type')) res.type('text/html; charset=utf-8'); res.body = result; } else res.json(result); res.statusCode = res.explicitStatus ? res.statusCode : defaultStatus; }
            return res.toResponse();
          }
          res.statusCode = defaultStatus;
          if (result === undefined || result === null) { res.body = ''; return res.toResponse(); }
          if (typeof result === 'string') { if (!res.headers.has('content-type')) res.type('text/html; charset=utf-8'); res.body = result; return res.toResponse(); }
          res.json(result);
          res.statusCode = defaultStatus;
          return res.toResponse();
        } catch (e) {
          return errorToResponse(e);
        }
      };
      for (const cp of ctrlPaths) for (const mp of ([] as string[]).concat(methodPaths)) {
        const path = joinPath(prefix, cp, mp);
        (app as unknown as Record<string, (p: string, h: (c: Context) => Promise<Response>) => void>)[verb](path, handler);
        opts.onRoute?.(verb.toUpperCase(), path, Ctrl.name, name);
      }
    }
  }
}

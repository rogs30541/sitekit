import { NextResponse, type NextRequest } from 'next/server';

/** 301 導向表：從 api 讀 redirects，記憶體快取 5 分鐘。搬運舊站時保住 SEO 權重。 */
const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const TTL = 5 * 60_000;
let cache: { at: number; map: Map<string, { to: string; code: number }> } | null = null;

async function redirects() {
  if (cache && Date.now() - cache.at < TTL) return cache.map;
  try {
    const res = await fetch(`${API}/api/content/redirects`, { cache: 'no-store' });
    const rows = (await res.json()) as { fromPath: string; toPath: string; code: number }[];
    cache = { at: Date.now(), map: new Map(rows.map((r) => [r.fromPath, { to: r.toPath, code: r.code }])) };
  } catch {
    cache = { at: Date.now(), map: cache?.map ?? new Map() };
  }
  return cache.map;
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/\/+$/, '') || '/';
  const hit = (await redirects()).get(path);
  if (hit) return NextResponse.redirect(new URL(hit.to, req.url), hit.code === 302 ? 302 : 301);
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)'],
};

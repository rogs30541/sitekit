import { NextResponse, type NextRequest } from 'next/server';

/**
 * 1) 安裝精靈閘門：admin_users 為空（全新站台）時，所有頁面導到 /setup（api、靜態檔除外）
 * 2) 301 導向表：從 api 讀 redirects，記憶體快取 60 秒（匯入後最多 1 分鐘生效）。搬運舊站時保住 SEO 權重。
 */
const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const TTL = 60_000;
let cache: { at: number; map: Map<string, { to: string; code: number }> } | null = null;
/** needsSetup=true 時每 15 秒重查（精靈完成後很快解除）；false 時 10 分鐘（不會再變回 true） */
let setup: { at: number; needsSetup: boolean } | null = null;

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

async function needsSetup() {
  if (setup && Date.now() - setup.at < (setup.needsSetup ? 15_000 : 600_000)) return setup.needsSetup;
  try {
    const res = await fetch(`${API}/api/setup/status`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    const j = (await res.json()) as { needsSetup?: boolean };
    setup = { at: Date.now(), needsSetup: !!j.needsSetup };
  } catch {
    setup = { at: Date.now(), needsSetup: setup?.needsSetup ?? false };
  }
  return setup.needsSetup;
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/\/+$/, '') || '/';
  if (path !== '/setup' && (await needsSetup())) return NextResponse.redirect(new URL('/setup', req.url), 302);
  const hit = (await redirects()).get(path);
  if (hit) return NextResponse.redirect(new URL(hit.to, req.url), hit.code === 302 ? 302 : 301);
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next|sitekit-internal|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)'],
};

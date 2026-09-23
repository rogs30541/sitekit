import { createHmac, timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/** 本機驗證（有 REVALIDATE_SECRET 或 SESSION_SECRET 時）；否則回呼 api 驗 token */
async function verify(token: string) {
  const secret = process.env.REVALIDATE_SECRET ?? process.env.SESSION_SECRET;
  const [ts, sig] = token.split('.');
  if (!ts || !sig || !/^\d+$/.test(ts) || Math.abs(Date.now() - Number(ts)) > 120_000) return false;
  if (secret) {
    const expect = createHmac('sha256', secret).update(`revalidate:${ts}`).digest('base64url');
    return sig.length === expect.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
  }
  try {
    const r = await fetch(`${API}/api/internal/revalidate/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const j = (await r.json()) as { ok?: boolean };
    return !!j.ok;
  } catch {
    return false;
  }
}

/**
 * 發佈即清快取：api 在內容發佈／選單／設定／商品課程變更後打這裡，清掉整站 ISR 快取（含 sitemap）。
 * 路徑刻意不放在 /api 下（/api/* 會被 rewrites 轉到 api）；也不能用 _ 開頭資料夾（App Router 視為 private folder 不產生路由）。
 */
export async function POST(req: Request) {
  const ok = await verify(req.headers.get('x-sitekit-token') ?? '');
  if (!ok) return Response.json({ ok: false, error: 'invalid token' }, { status: 401 });
  revalidatePath('/', 'layout');
  revalidatePath('/sitemap.xml');
  return Response.json({ ok: true, at: new Date().toISOString() });
}

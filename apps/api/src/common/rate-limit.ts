import type { NextFunction, Request, Response } from 'express';

interface Rule {
  test: (path: string) => boolean;
  limit: number;
  windowMs: number;
  name: string;
}

/**
 * 程序內固定視窗限流（單副本足夠；多副本改 Redis）。
 * 依來源 IP＋規則名計數；超限回 429 並帶 Retry-After。金流回呼與健康檢查不限流。環境變數 RATE_LIMIT=off 可整個關閉（本機 E2E 用）。
 */
export function rateLimit(rules: Rule[]) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }, 60_000);
  sweep.unref();
  const disabled = process.env.RATE_LIMIT === 'off';
  return (req: Request, res: Response, next: NextFunction) => {
    if (disabled) return next();
    const path = req.path;
    const rule = rules.find((r) => r.test(path));
    if (!rule) return next();
    const ip = (req.ip ?? req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '');
    const key = `${rule.name}:${ip}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + rule.windowMs };
      buckets.set(key, b);
    }
    b.count++;
    res.setHeader('X-RateLimit-Limit', String(rule.limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, rule.limit - b.count)));
    if (b.count > rule.limit) {
      res.setHeader('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      res.status(429).json({ statusCode: 429, message: 'too many requests', rule: rule.name });
      return;
    }
    next();
  };
}

/** 預設規則：登入／註冊每 IP 10 分鐘 20 次；MCP 路徑每分鐘 120 次；其餘 API 每分鐘 600 次。 */
export const DEFAULT_RULES: Rule[] = [
  { name: 'auth', test: (p) => /^\/api\/auth\/(login|register|dev-login)/.test(p), limit: 20, windowMs: 10 * 60_000 },
  { name: 'ops', test: (p) => p.startsWith('/api/ops'), limit: 120, windowMs: 60_000 },
  { name: 'api', test: (p) => p.startsWith('/api/') && !/^\/api\/(payments\/[a-z]+\/(notify|return)|health|assets)/.test(p), limit: 600, windowMs: 60_000 },
];

/**
 * SiteKit 單體殼（1.0 預設安裝形態）：一個 Node 程序、一個埠，同時跑 API（Nest／Express）與前台（Next.js）。
 * - /api/*           → Nest（與分離殼完全相同的 createApiApp()）
 * - 其餘             → Next.js request handler（apps/web 的正式建置）
 * 預設 SQLite（DATABASE_URL=file:<data>/sitekit.db）、上傳存 <data>/storage；有 Node 20 的主機就能跑。
 * 環境變數由 bin/sitekit.mjs 先補齊預設值再載入本檔。
 */
import 'reflect-metadata';
import { createServer } from 'node:http';
import { dirname } from 'node:path';

async function main() {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  // 先設好內部呼叫網址再載入 api／web：兩者都在同一個程序、同一個埠
  process.env.API_INTERNAL_URL ??= `http://127.0.0.1:${port}`;
  process.env.FRONTEND_URL ??= `http://localhost:${port}`;

  const { createApiApp } = (await import('@sitekit/api/dist/app')) as typeof import('@sitekit/api/dist/app');
  const { app, express } = await createApiApp();

  const webDir = dirname(require.resolve('@sitekit/web/package.json'));
  const next = (await import('next')).default;
  const web = next({ dev: false, dir: webDir, hostname: host, port });
  await web.prepare();
  const handle = web.getRequestHandler();

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/api' || url.startsWith('/api/') || url.startsWith('/api?')) {
      express(req, res);
      return;
    }
    void handle(req, res);
  });
  server.keepAliveTimeout = 65_000;
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  console.log(`[sitekit] ${process.env.APP_ENV ?? 'development'} · http://localhost:${port}  （api：/api/health、前台與後台同一埠）`);

  const shutdown = async (sig: string) => {
    console.log(`[sitekit] ${sig}，關閉中…`);
    server.close();
    await app.close().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((e) => {
  console.error('[sitekit] 啟動失敗：', e);
  process.exit(1);
});

import type { NextConfig } from 'next';
import path from 'node:path';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // OpenNext（Cloudflare）建置時不可用 standalone（由適配器自行打包）；Node／Docker 殼維持 standalone
  ...(process.env.OPEN_NEXT_CLOUDFLARE ? {} : { output: 'standalone' as const }),
  // monorepo：standalone 追蹤根目錄（以 apps/web 為 cwd 建置）
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  transpilePackages: ['@sitekit/shared'],
  // 同網域 /api/* 反向代理到 api 服務：cookie 同源、不碰 CORS
  // Node／Docker：beforeFiles 讓 rewrite 先於 app/api/[...path] 代理 handler；OpenNext（Workers）不設 rewrite（同 zone fetch 不可用），改由該 handler 走 Service Binding
  async rewrites() {
    if (process.env.OPEN_NEXT_CLOUDFLARE) return { beforeFiles: [], afterFiles: [], fallback: [] };
    return { beforeFiles: [{ source: '/api/:path*', destination: `${API_INTERNAL_URL}/api/:path*` }], afterFiles: [], fallback: [] };
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=15552000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;

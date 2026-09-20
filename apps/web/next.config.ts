import type { NextConfig } from 'next';
import path from 'node:path';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // monorepo：standalone 追蹤根目錄（以 apps/web 為 cwd 建置）
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  transpilePackages: ['@sitekit/shared'],
  // 同網域 /api/* 反向代理到 api 服務：cookie 同源、不碰 CORS
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_INTERNAL_URL}/api/:path*` }];
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

import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * OpenNext（Cloudflare Workers）設定：先不接 ISR 快取（R2／KV），revalidate 頁面在 Workers 上以動態渲染回應；
 * 流量大再開 R2 incremental cache（docs/雙平台部署架構.md §13）。
 */
export default defineCloudflareConfig({});

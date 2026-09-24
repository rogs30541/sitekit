// Cloudflare Containers 入口：一個常駐容器（單體殼），Worker 把所有請求轉給它
// 單站台＝單一實例（idFromName('sitekit')）；FRONTEND_URL 由第一個請求的 Host 帶入（也可在後台 site.url 設）
import { Container, getContainer } from '@cloudflare/containers';

export class SiteKitContainer extends Container {
  defaultPort = 3000;
  sleepAfter = '10m';
  envVars = {
    APP_ENV: 'production',
    PORT: '3000',
    SITEKIT_DATA_DIR: '/data',
    DATABASE_URL: (this.env as { DATABASE_URL?: string }).DATABASE_URL ?? '',
    SESSION_SECRET: (this.env as { SESSION_SECRET?: string }).SESSION_SECRET ?? '',
    OPS_TOKEN: (this.env as { OPS_TOKEN?: string }).OPS_TOKEN ?? '',
    FRONTEND_URL: (this.env as { FRONTEND_URL?: string }).FRONTEND_URL ?? '',
  };
}

export default {
  async fetch(request: Request, env: { SITEKIT: DurableObjectNamespace<SiteKitContainer> }): Promise<Response> {
    const container = getContainer(env.SITEKIT, 'sitekit');
    return container.fetch(request);
  },
};

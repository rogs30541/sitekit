import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** 版本讀 apps/api/package.json（正式環境以 node 直接啟動，沒有 npm_package_version） */
export const VERSION = (() => {
  try {
    return (JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return process.env.npm_package_version ?? '0.0.0';
  }
})();

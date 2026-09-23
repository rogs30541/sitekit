/**
 * core 的環境值：殼層啟動時以 configureCore() 注入（Workers 沒有 process.env）；Node 殼未注入時退回 process.env。
 * 讀取一律經 getter（呼叫時才取值），避免 import 時機問題。
 */
const store: Record<string, string | undefined> = {};
export function configureCore(values: Record<string, string | number | boolean | undefined | null>) {
  for (const [k, v] of Object.entries(values)) store[k] = v === undefined || v === null ? undefined : String(v);
}
const read = (k: string, def = ''): string => {
  const v = store[k] ?? (typeof process !== 'undefined' ? process.env?.[k] : undefined);
  return v === undefined || v === '' ? def : v;
};
export const env = {
  get APP_ENV(): 'development' | 'staging' | 'production' {
    const v = read('APP_ENV', 'development');
    return v === 'production' || v === 'staging' ? v : 'development';
  },
  get FRONTEND_URL() {
    return read('FRONTEND_URL', 'http://localhost:3000');
  },
  get SESSION_SECRET() {
    return read('SESSION_SECRET', 'dev-only-secret');
  },
  get OPS_TOKEN(): string | undefined {
    return read('OPS_TOKEN') || undefined;
  },
  get REDIS_URL(): string | undefined {
    return read('REDIS_URL') || undefined;
  },
  get STORAGE_DIR(): string | undefined {
    return read('STORAGE_DIR') || undefined;
  },
  get APP_VERSION() {
    return read('APP_VERSION', '0.0.0');
  },
  /** 備份目錄（不經 /api/assets 公開）；預設 STORAGE_DIR 的上一層 /backups，再退 cwd/backups */
  get BACKUP_DIR() {
    return read('BACKUP_DIR');
  },
  /** 版本更新檢查的 GitHub repo（owner/name）；空字串＝關閉 */
  get UPDATE_REPO() {
    return read('SITEKIT_UPDATE_REPO', 'rogs30541/sitekit');
  },
};
export const isProd = () => env.APP_ENV === 'production';

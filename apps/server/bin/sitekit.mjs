#!/usr/bin/env node
/**
 * sitekit CLI（單體殼）：
 *   sitekit start [--port 3000] [--data ./data] [--demo]   套用遷移、補種子（預設設定＋模板），啟動單一程序
 *   sitekit migrate                                      只套用資料庫遷移
 *   sitekit seed [--demo]                                只補種子（--demo 建示範帳號與內容）
 *   sitekit env                                          印出實際生效的設定（機密遮蔽）
 * 環境變數（都有預設值，全新主機不用設）：
 *   PORT（3000）、SITEKIT_DATA_DIR（./data）、DATABASE_URL（file:<data>/sitekit.db；也可 postgresql://…）、
 *   STORAGE_DIR（<data>/storage）、FRONTEND_URL（http://localhost:<port>；正式請設公開網址或到後台填 site.url）、
 *   APP_ENV（production）、SESSION_SECRET／OPS_TOKEN（不設＝首次啟動自動產生存資料庫）
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('--')) ?? 'start';
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  return v && !v.startsWith('--') ? v : true;
};

// 本機 .env（cwd）：只補未設的
const envFile = resolve(process.cwd(), '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const port = String(flag('port', process.env.PORT ?? '3000'));
const dataDir = resolve(String(flag('data', process.env.SITEKIT_DATA_DIR ?? resolve(process.cwd(), 'data'))));
mkdirSync(dataDir, { recursive: true });
process.env.PORT = port;
process.env.SITEKIT_DATA_DIR = dataDir;
process.env.APP_ENV ??= 'production';
process.env.NODE_ENV ??= 'production';
process.env.DATABASE_URL ??= `file:${dataDir.replace(/\\/g, '/')}/sitekit.db`;
process.env.STORAGE_DIR ??= resolve(dataDir, 'storage');
process.env.FRONTEND_URL ??= `http://localhost:${port}`;
process.env.API_INTERNAL_URL ??= `http://127.0.0.1:${port}`;
mkdirSync(process.env.STORAGE_DIR, { recursive: true });

const mask = (k, v) => (/secret|token|password|key/i.test(k) && v ? `****(${v.length})` : v);
const show = () => {
  for (const k of ['APP_ENV', 'PORT', 'SITEKIT_DATA_DIR', 'DATABASE_URL', 'STORAGE_DIR', 'FRONTEND_URL', 'SESSION_SECRET', 'OPS_TOKEN']) console.log(`${k}=${mask(k, process.env[k] ?? '')}`);
};

function migrate() {
  const wrapper = require.resolve('@sitekit/db/scripts/prisma.mjs');
  const r = spawnSync(process.execPath, [wrapper, 'migrate'], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error('[sitekit] 資料庫遷移失敗');
    process.exit(r.status ?? 1);
  }
}
async function seed(demo) {
  const { createPrisma } = require('@sitekit/db');
  const libPath = require.resolve('@sitekit/api/prisma/seed-lib.mjs');
  const { seedBaseline, seedDemo } = await import(pathToFileURL(libPath).href);
  const prisma = createPrisma();
  try {
    const b = await seedBaseline(prisma);
    console.log(`[sitekit] 預設設定 ${b.settings}、產圖模板 +${b.templatesCreated}（共 ${b.templatesTotal}）`);
    if (demo) {
      const d = await seedDemo(prisma);
      console.log(`[sitekit] DEMO：管理員 ${d.admin}（admin12345）、課程 /course/${d.course}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

switch (cmd) {
  case 'env':
    show();
    break;
  case 'migrate':
    migrate();
    break;
  case 'seed':
    await seed(flag('demo', false) === true);
    break;
  case 'start': {
    show();
    migrate();
    await seed(flag('demo', false) === true);
    await import(pathToFileURL(resolve(here, '../dist/main.js')).href);
    break;
  }
  default:
    console.log('usage: sitekit start|migrate|seed|env [--port N] [--data DIR] [--demo]');
}

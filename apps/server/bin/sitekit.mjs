#!/usr/bin/env node
/**
 * sitekit CLI（單體殼）：
 *   sitekit start [--port 3000] [--data ./data] [--demo]   套用遷移、補種子（預設設定＋模板），啟動單一程序
 *   sitekit migrate                                      只套用資料庫遷移
 *   sitekit seed [--demo]                                只補種子（--demo 建示範帳號與內容）
 *   sitekit env                                          印出實際生效的設定（機密遮蔽）
 *   sitekit admin set-email <email> [--password <pw>]     救援：把主管理員（第一位 superadmin）的 Email 改成它（沒有管理員時兩者都給＝建立第一位）
 *   sitekit admin reset-password <email> <password>       救援：重設該管理員密碼（清掉所有登入）
 *   （同義的環境變數：SITEKIT_ADMIN_EMAIL／SITEKIT_ADMIN_PASSWORD，每次啟動套用，用完請移除）
 *   sitekit export [--out FILE] [--no-secrets]           整庫匯出 JSON（預設含機密，搬家用）
 *   sitekit import FILE --confirm                        從匯出檔還原（清空後覆蓋，不可逆）
 * 環境變數（都有預設值，全新主機不用設）：
 *   PORT（3000）、SITEKIT_DATA_DIR（./data）、DATABASE_URL（file:<data>/sitekit.db；也可 postgresql://… 或 mysql://…）、
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

// 連線字串只遮密碼（postgresql://user:****@host/db），其餘機密整串遮
const mask = (k, v) => {
  if (!v) return v;
  if (/secret|token|password|key/i.test(k)) return `****(${v.length})`;
  if (/_URL$/.test(k)) return v.replace(/^([a-z][a-z0-9+.-]*:\/\/[^:@\/]+:)[^@]+@/i, '$1****@');
  return v;
};
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

async function exporter() {
  const { createPrisma } = require('@sitekit/db');
  const { ExportService, configureCore } = require('@sitekit/core');
  configureCore({ APP_VERSION: require('../package.json').version });
  const prisma = createPrisma();
  return { prisma, svc: new ExportService(prisma) };
}
switch (cmd) {
  case 'export': {
    const { prisma, svc } = await exporter();
    try {
      const b = await svc.exportAll({ includeSecrets: !args.includes('--no-secrets') });
      const out = flag('out', '');
      const text = JSON.stringify(b);
      if (out && out !== true) {
        const { writeFileSync } = await import('node:fs');
        writeFileSync(resolve(String(out)), text);
        console.error(`[sitekit] 已匯出 ${Object.values(b.counts).reduce((a, c) => a + c, 0)} 列 → ${resolve(String(out))}`);
      } else process.stdout.write(text);
    } finally {
      await prisma.$disconnect();
    }
    break;
  }
  case 'import': {
    const file = args.find((a, i) => i > 0 && !a.startsWith('--') && args[i - 1] === 'import') ?? args[1];
    if (!file || file.startsWith('--')) {
      console.error('usage: sitekit import FILE --confirm');
      process.exit(1);
    }
    if (!args.includes('--confirm')) {
      console.error('[sitekit] 匯入會清空並覆蓋整個資料庫，請加 --confirm');
      process.exit(1);
    }
    const { prisma, svc } = await exporter();
    try {
      const bundle = JSON.parse(readFileSync(resolve(file), 'utf8'));
      const r = await svc.importAll(bundle, { mode: 'replace', confirm: true, actor: 'cli' });
      console.log(`[sitekit] 匯入完成：${Object.values(r.counts).reduce((a, c) => a + c, 0)} 列（來源版本 ${r.sourceVersion ?? '?'}）`);
    } finally {
      await prisma.$disconnect();
    }
    break;
  }
  case 'env':
    show();
    break;
  case 'admin': {
    // 救援：不需登入、不需收信。set-email <email> [--password <pw>]／reset-password <email> <password>
    const sub = args[args.indexOf('admin') + 1];
    const positional = args.slice(args.indexOf('admin') + 2).filter((x, i, arr) => !x.startsWith('--') && (i === 0 || !arr[i - 1].startsWith('--')));
    const email = positional[0];
    const password = sub === 'reset-password' ? positional[1] : flag('password', '');
    if (!sub || !email || (sub === 'reset-password' && !password) || !['set-email', 'reset-password'].includes(sub)) {
      console.error('usage: sitekit admin set-email <email> [--password <pw>] | sitekit admin reset-password <email> <password>');
      process.exit(1);
    }
    const { createPrisma } = require('@sitekit/db');
    const { AdminAuthService, NotifyService, SettingsService } = require('@sitekit/core');
    const prisma = createPrisma();
    try {
      const settings = new SettingsService(prisma);
      const admins = new AdminAuthService(prisma, new NotifyService(settings, prisma), settings);
      const r = await admins.rescue(sub === 'set-email' ? { mode: 'set-email', email, password: password && password !== true ? String(password) : '' } : { mode: 'reset-password', email, password: String(password) });
      console.log(`[sitekit] 管理員救援完成：${r.applied.join('、') || '（無變更）'}${r.email ? `（${r.email}）` : ''}`);
    } finally {
      await prisma.$disconnect();
    }
    break;
  }
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
    console.log('usage: sitekit start|migrate|seed|env|export|import|admin [--port N] [--data DIR] [--demo]');
}

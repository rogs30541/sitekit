#!/usr/bin/env node
/**
 * 免 Docker 的本機開發資料庫：直接驅動 @embedded-postgres 附帶的 initdb / pg_ctl / postgres。
 *
 *   npm run dev:db          啟動（保持視窗開著；Ctrl+C 停止）
 *   npm run dev:db:stop     停止
 *
 * 連線字串：postgresql://sitekit:sitekit@localhost:5432/sitekit（DEV_DB_PORT 可改埠）
 *
 * Windows 陷阱：initdb 會把自身 share 目錄路徑帶進 bootstrap SQL，專案路徑含中文（cp950）時會炸
 * 「invalid byte sequence for encoding UTF8」。因此二進位與資料目錄一律放 ASCII 路徑：
 * 預設 %LOCALAPPDATA%/sitekit（或 ~/.sitekit），可用 DEV_DB_DIR 覆蓋。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const port = Number(process.env.DEV_DB_PORT ?? 5432);
const base = resolve(process.env.DEV_DB_DIR ?? join(process.env.LOCALAPPDATA ?? join(homedir(), '.sitekit'), 'sitekit'));
const dataDir = join(base, 'devdb');
const logFile = join(base, 'devdb.log');

const platformPkg = `@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
const nativeSrc = join(repoRoot, 'node_modules', platformPkg, 'native');
if (!existsSync(nativeSrc)) {
  console.error(`[dev-db] ${platformPkg} not installed at ${nativeSrc}`);
  process.exit(1);
}
const nonAscii = /[^\x00-\x7F]/.test(nativeSrc);
const binRoot = nonAscii ? join(base, 'pg') : nativeSrc;
const exe = (name) => join(binRoot, 'bin', name + (win ? '.exe' : ''));

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) {
    console.error(`[dev-db] ${cmd} ${args.join(' ')} exited with ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

mkdirSync(base, { recursive: true });

if (process.argv[2] === 'stop') {
  run(exe('pg_ctl'), ['stop', '-D', dataDir, '-m', 'fast']);
  process.exit(0);
}

if (nonAscii && !existsSync(exe('initdb'))) {
  console.log(`[dev-db] project path is non-ASCII; copying Postgres binaries to ${binRoot}`);
  // 不用 fs.cpSync：Windows 沙箱下複製大量 exe/dll 會無聲退出；改用系統複製工具
  mkdirSync(binRoot, { recursive: true });
  if (win) {
    const r = spawnSync('robocopy', [nativeSrc, binRoot, '/E', '/NFL', '/NDL', '/NJH', '/NJS'], { stdio: 'inherit' });
    if ((r.status ?? 16) >= 8) {
      console.error('[dev-db] robocopy failed');
      process.exit(1);
    }
  } else {
    run('cp', ['-R', nativeSrc + '/.', binRoot]);
  }
}

if (!existsSync(join(dataDir, 'PG_VERSION'))) {
  console.log('[dev-db] initialising cluster at', dataDir);
  const pwFile = join(base, 'pw.txt');
  writeFileSync(pwFile, 'sitekit\n');
  run(exe('initdb'), ['--pgdata', dataDir, '--username=sitekit', `--pwfile=${pwFile}`, '--auth=password', '--locale=C', '--encoding=UTF8']);
  // 單使用者模式建立 sitekit 資料庫（套件未附 createdb / psql）
  run(exe('postgres'), ['--single', '-D', dataDir, 'postgres'], { input: 'CREATE DATABASE sitekit;\n', stdio: ['pipe', 'ignore', 'inherit'] });
}

run(exe('pg_ctl'), ['start', '-w', '-D', dataDir, '-l', logFile, '-o', `-p ${port}`]);
console.log(`[dev-db] ready: postgresql://sitekit:sitekit@localhost:${port}/sitekit  (data ${dataDir}; Ctrl+C to stop)`);

const stop = () => {
  spawnSync(exe('pg_ctl'), ['stop', '-D', dataDir, '-m', 'fast'], { stdio: 'inherit' });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);

#!/usr/bin/env node
/**
 * 把 packages/db/sqlite/migrations/<stamp>_<name>/migration.sql（Prisma 格式）轉成 D1 的 migrations/NNNN_<name>.sql。
 * D1 的差異：不接受 PRAGMA foreign_keys=OFF/ON（改用 defer_foreign_keys）、不接受 PRAGMA foreign_key_check。
 * 每次改模型（diff-sqlite）後重跑；已存在且內容相同的檔案不動。
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../../packages/db/sqlite/migrations');
const out = resolve(here, '../migrations');
mkdirSync(out, { recursive: true });
const dirs = readdirSync(src).filter((d) => /^\d{14}_/.test(d)).sort();
let n = 0;
dirs.forEach((d, i) => {
  const name = d.replace(/^\d{14}_/, '');
  const file = resolve(out, `${String(i + 1).padStart(4, '0')}_${name}.sql`);
  let sql = readFileSync(resolve(src, d, 'migration.sql'), 'utf8');
  sql = sql
    .replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*OFF\s*;\s*$/gim, 'PRAGMA defer_foreign_keys = true;')
    .replace(/^\s*PRAGMA\s+foreign_keys\s*=\s*ON\s*;\s*$/gim, '')
    .replace(/^\s*PRAGMA\s+foreign_key_check\s*;\s*$/gim, '');
  const header = `-- 由 packages/db/sqlite/migrations/${d} 產生（node apps/worker/scripts/sync-migrations.mjs），勿手改\n`;
  const body = header + sql.trim() + '\n';
  if (existsSync(file) && readFileSync(file, 'utf8') === body) return;
  writeFileSync(file, body);
  n++;
});
console.log(`D1 migrations：${dirs.length} 份（${n} 份更新）→ ${out}`);

#!/usr/bin/env node
/**
 * 由 apps/api/prisma/schema.prisma（PostgreSQL 版＝單一真相源）產生 MySQL 版 schema（packages/db/mysql/schema.prisma）：
 * - enum、Json、Decimal、DateTime 原生保留（Json 的 @default 由 Prisma Client 端套用，MySQL 不落 DB default）
 * - String[] → String @db.VarChar(4000)（JSON 陣列字串；執行期由 createPrisma() 依欄位名轉換，與 SQLite 同一套）
 *   ※ 不用 TEXT：MySQL 的 TEXT／JSON 欄位不能有字面 DEFAULT，而陣列欄位需要 @default("[]")
 * - 一般 String：@id／@unique／@@unique／@@index／關聯外鍵／有 @default 的維持 VARCHAR(191)（MySQL 索引鍵需定長）；
 *   其餘（內文、網址、描述…）→ @db.Text，避免 191 字元截斷
 * - 保留 PG 版已有的 @db.Decimal 等註記
 * 禁止手改 mysql/schema.prisma；改模型一律改 Postgres 版再重跑本腳本（npm run build -w @sitekit/db 會自動跑）。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../../apps/api/prisma/schema.prisma');
const outSchema = resolve(here, '../mysql/schema.prisma');

let s = readFileSync(src, 'utf8');
s = s.replace(/provider\s*=\s*"postgresql"/, 'provider = "mysql"');
s = s.replace(/generator client \{\n/, 'generator client {\n  output        = "./client"\n');

// 逐 model 收集「必須維持 VARCHAR」的欄位：@@unique／@@index 內的欄位＋@relation(fields: [...]) 的外鍵
const keyed = new Map(); // model → Set(field)
let cur = '';
for (const line of s.split('\n')) {
  const mm = line.match(/^model\s+(\w+)/);
  if (mm) {
    cur = mm[1];
    keyed.set(cur, new Set());
    continue;
  }
  if (!cur) continue;
  const idx = line.match(/^\s+@@(unique|index)\(\[([^\]]+)\]/);
  if (idx) for (const f of idx[2].split(',')) keyed.get(cur).add(f.trim().replace(/\(.*$/, ''));
  const rel = line.match(/@relation\([^)]*fields:\s*\[([^\]]+)\]/);
  if (rel) for (const f of rel[1].split(',')) keyed.get(cur).add(f.trim());
}

const array = [];
const text = [];
let model = '';
const lines = s.split('\n').map((line) => {
  const mm = line.match(/^model\s+(\w+)/);
  if (mm) model = mm[1];
  if (line.match(/^enum\s+/)) model = '';
  const f = line.match(/^(\s+)(\w+)(\s+)([\w\[\]?]+)(\s.*)?$/);
  if (!f || !model || line.trim().startsWith('@@') || line.trim().startsWith('//')) return line;
  let [, indent, name, gap, type, rest = ''] = f;
  const optional = type.endsWith('?') ? '?' : '';
  const base = type.replace(/\?$/, '');
  if (base === 'String[]') {
    type = 'String';
    rest = rest.replace(/@default\(\[\]\)/, '@default("[]")');
    rest = `${rest} @db.VarChar(4000)`;
    array.push(`${model}.${name}`);
  } else if (base === 'String' && !/@db\./.test(rest)) {
    const isKey = /@id\b|@unique\b|@default\(|@relation\(/.test(rest) || keyed.get(model)?.has(name);
    if (!isKey) {
      rest = `${rest} @db.Text`;
      text.push(`${model}.${name}${optional}`);
    }
  }
  return `${indent}${name}${gap}${type}${rest}`;
});
s = lines.join('\n');
s = `// ⚠ 自動產生（node packages/db/scripts/gen-mysql-schema.mjs），勿手改；來源＝apps/api/prisma/schema.prisma\n` + s;
mkdirSync(dirname(outSchema), { recursive: true });
writeFileSync(outSchema, s);
console.log(`mysql schema → ${outSchema}\narray→VarChar(4000) ${array.length}：${array.join('、')}\nString→Text ${text.length}`);
if (process.argv.includes('--list-text')) console.log(text.join('\n'));

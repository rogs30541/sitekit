#!/usr/bin/env node
/**
 * 由 apps/api/prisma/schema.prisma（PostgreSQL 版＝單一真相源）產生 SQLite 版 schema：
 * - enum → String（@default(x) → @default("x")）
 * - Json → String（JSON 字串；執行期由 packages/db 的 createPrisma() 自動 parse／stringify）
 * - String[] → String（JSON 陣列字串）
 * - 移除 @db.* 原生型別註記
 * 同時輸出 src/json-fields.json（哪些欄位名要轉換），給執行期轉換層用。
 * 禁止手改 sqlite/schema.prisma；改模型一律改 Postgres 版再重跑本腳本。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../../../apps/api/prisma/schema.prisma');
const outSchema = resolve(here, '../sqlite/schema.prisma');
const outFields = resolve(here, '../src/json-fields.json');

let s = readFileSync(src, 'utf8');
const enums = [...s.matchAll(/^enum\s+(\w+)\s*\{[\s\S]*?^\}/gm)].map((m) => m[1]);
s = s.replace(/^enum\s+\w+\s*\{[\s\S]*?^\}\n\n?/gm, '');
s = s.replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"');
s = s.replace(/generator client \{\n/, 'generator client {\n  output        = "./client"\n');

const json = new Set();
const array = new Set();
const stringFields = new Set();
let model = '';
const lines = s.split('\n').map((line) => {
  const mm = line.match(/^model\s+(\w+)/);
  if (mm) model = mm[1];
  const f = line.match(/^(\s+)(\w+)(\s+)([\w\[\]?]+)(\s.*)?$/);
  if (!f || !model || line.trim().startsWith('@@') || line.trim().startsWith('//')) return line;
  let [, indent, name, gap, type, rest = ''] = f;
  const optional = type.endsWith('?') ? '?' : '';
  const base = type.replace(/\?$/, '');
  if (enums.includes(base)) {
    type = `String${optional}`;
    rest = rest.replace(/@default\((\w+)\)/, '@default("$1")');
  } else if (base === 'Json') {
    type = `String${optional}`;
    json.add(name);
  } else if (base === 'String[]') {
    type = 'String';
    rest = rest.replace(/@default\(\[\]\)/, '@default("[]")');
    array.add(name);
  } else if (base === 'String') {
    stringFields.add(name);
  }
  rest = rest.replace(/\s*@db\.\w+(\([^)]*\))?/g, '');
  return `${indent}${name}${gap}${type}${rest}`;
});
s = lines.join('\n');
s = `// ⚠ 自動產生（node packages/db/scripts/gen-sqlite-schema.mjs），勿手改；來源＝apps/api/prisma/schema.prisma\n` + s;

// 執行期轉換是「依欄位名」：同名的一般 String 欄位會被誤轉，這裡先擋
const clash = [...json, ...array].filter((n) => stringFields.has(n));
if (clash.length) {
  console.error('json/array 欄位名與一般 String 欄位撞名，請改名：', clash);
  process.exit(1);
}
mkdirSync(dirname(outSchema), { recursive: true });
writeFileSync(outSchema, s);
mkdirSync(dirname(outFields), { recursive: true });
writeFileSync(outFields, JSON.stringify({ json: [...json].sort(), array: [...array].sort(), enums }, null, 2) + '\n');
console.log(`sqlite schema → ${outSchema}\njson fields ${json.size}、array fields ${array.size}、enums ${enums.length} → ${outFields}`);

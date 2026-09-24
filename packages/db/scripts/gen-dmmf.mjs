#!/usr/bin/env node
/**
 * 把 PostgreSQL 版 client 的 Prisma.dmmf（模型／欄位／關聯中繼資料）落成 src/dmmf.json：
 * - Cloudflare Workers（wasm client）沒有 Prisma.dmmf，ExportService 等改讀這份 JSON（getDmmf()）
 * - 同時輸出全部 DateTime 欄位名，給 D1 adapter 的欄位型別修正用（adapter 靠值的長相猜型別，String 欄位存了日期字串會被誤判）
 * 於 npm run build -w @sitekit/db 的 generate 之後執行。
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const { Prisma } = require('@prisma/client');
const models = Prisma.dmmf.datamodel.models.map((m) => ({
  name: m.name,
  dbName: m.dbName ?? null,
  fields: m.fields.map((f) => ({ name: f.name, kind: f.kind, type: f.type, isList: f.isList, isRequired: f.isRequired, isId: f.isId, isUnique: f.isUnique, relationName: f.relationName ?? null, relationFromFields: f.relationFromFields ?? [], relationToFields: f.relationToFields ?? [], hasDefaultValue: f.hasDefaultValue, isUpdatedAt: f.isUpdatedAt ?? false })),
  primaryKey: m.primaryKey ?? null,
  uniqueFields: m.uniqueFields ?? [],
}));
const dateTimeFields = [...new Set(models.flatMap((m) => m.fields.filter((f) => f.kind === 'scalar' && f.type === 'DateTime').map((f) => f.name)))].sort();
const out = resolve(here, '../src/dmmf.json');
writeFileSync(out, JSON.stringify({ datamodel: { models }, dateTimeFields }, null, 2) + '\n');
console.log(`dmmf → ${out}（${models.length} models，DateTime 欄位名 ${dateTimeFields.length}）`);

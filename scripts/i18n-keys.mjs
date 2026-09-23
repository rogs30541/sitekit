#!/usr/bin/env node
/**
 * 列出前台程式碼裡 t('…') 的所有 key，與 packages/shared/src/i18n/<locale>.ts 比對，印出未翻譯的 key。
 *   node scripts/i18n-keys.mjs            # 預設 en
 *   node scripts/i18n-keys.mjs --json     # 輸出 JSON（給翻譯工具）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const locale = process.argv.find((a) => /^[a-z]{2}(-[A-Z]{2})?$/.test(a)) ?? 'en';
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) {
      if (!p.includes('(admin)') && !p.includes('node_modules') && !p.includes('.next')) walk(p);
    } else if (/\.tsx?$/.test(f)) files.push(p);
  }
};
walk(resolve(root, 'apps/web/app'));
walk(resolve(root, 'apps/web/components'));
const keys = new Set();
for (const p of files) for (const m of readFileSync(p, 'utf8').matchAll(/\b(?:t|tr)\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"));
const dictSrc = readFileSync(resolve(root, `packages/shared/src/i18n/${locale}.ts`), 'utf8');
const missing = [...keys].filter((k) => !dictSrc.includes(`'${k.replace(/'/g, "\\'")}':`) && !dictSrc.includes(`  ${k}:`)).sort();
if (process.argv.includes('--json')) console.log(JSON.stringify({ locale, total: keys.size, missing }, null, 2));
else {
  console.log(`${locale}：共 ${keys.size} 個 key，未翻 ${missing.length}`);
  for (const k of missing) console.log('  ' + k);
}
process.exit(missing.length ? 1 : 0);

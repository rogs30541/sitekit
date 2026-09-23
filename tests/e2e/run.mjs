#!/usr/bin/env node
/**
 * SiteKit e2e 執行器：依序跑 tests/e2e/p*.mjs（只打 HTTP，與平台無關），彙整 PASS/FAIL。
 *
 *   node tests/e2e/run.mjs                 # 全部
 *   node tests/e2e/run.mjs p25 payment     # 只跑指定檔（去掉 .mjs）
 *   API=http://localhost:4000 WEB=http://localhost:3000 node tests/e2e/run.mjs
 *
 * 前置：api 與 web 已啟動、DB 已 migrate＋seed（admin@example.com / admin12345）。
 * 執行器會先跑 _setup.mjs 建立測試會員 tester@example.com（password123）並補點數。
 * 需要 web 的檔案在檔頭有 `// needs: web`；WEB 未啟動時（探測失敗）會跳過並標 SKIP。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const API = process.env.API ?? 'http://localhost:4000';
const WEB = process.env.WEB ?? 'http://localhost:3000';
const only = new Set(process.argv.slice(2).map((s) => s.replace(/\.mjs$/, '')));

const probe = async (url) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return r.status < 500;
  } catch {
    return false;
  }
};
const runOne = (file, env) =>
  new Promise((resolve) => {
    const started = Date.now();
    const p = spawn(process.execPath, [join(dir, file)], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out, ms: Date.now() - started }));
  });

if (!(await probe(`${API}/api/health`))) {
  console.error(`API 未啟動：${API}/api/health`);
  process.exit(2);
}
const webUp = await probe(`${WEB}/`);
if (!webUp) console.warn(`WEB 未啟動（${WEB}）：需要 web 的測試將跳過`);

const files = readdirSync(dir)
  .filter((f) => /^(p\d+|payment)\.mjs$/.test(f))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  .filter((f) => !only.size || only.has(f.replace(/\.mjs$/, '')));

const setup = await runOne('_setup.mjs', { API });
if (setup.code !== 0) {
  console.error(setup.out);
  console.error('_setup 失敗');
  process.exit(2);
}
console.log(setup.out.trim());

const results = [];
for (const f of files) {
  const src = readFileSync(join(dir, f), 'utf8');
  const needsWeb = /^\/\/\s*needs:\s*web/m.test(src);
  if (needsWeb && !webUp) {
    results.push({ f, status: 'SKIP', ms: 0, out: '' });
    console.log(`SKIP ${f}（需要 web）`);
    continue;
  }
  const r = await runOne(f, { API, WEB });
  const passes = (r.out.match(/^PASS /gm) ?? []).length;
  const fails = (r.out.match(/^FAIL /gm) ?? []).length;
  const status = r.code === 0 && !fails ? 'PASS' : 'FAIL';
  results.push({ f, status, ms: r.ms, out: r.out, passes, fails });
  console.log(`${status} ${f}  ${passes} 通過／${fails} 失敗  ${(r.ms / 1000).toFixed(1)}s`);
  if (status === 'FAIL') console.log(r.out.split('\n').filter((l) => /^FAIL |Error|error|TypeError/.test(l)).slice(0, 12).map((l) => '    ' + l).join('\n'));
}
const failed = results.filter((r) => r.status === 'FAIL');
console.log(`\n${results.length} 檔：${results.filter((r) => r.status === 'PASS').length} PASS、${failed.length} FAIL、${results.filter((r) => r.status === 'SKIP').length} SKIP`);
if (failed.length && process.env.E2E_VERBOSE) for (const r of failed) console.log(`\n===== ${r.f} =====\n${r.out}`);
process.exit(failed.length ? 1 : 0);

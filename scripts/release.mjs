#!/usr/bin/env node
/**
 * 發版腳本：
 *   node scripts/release.mjs <版號> [--no-push]   升所有 package.json 版號 → CHANGELOG.md 加段（自上個 tag 以來的 commit 標題）→ commit → tag v<版號> → push（觸發 release.yml）
 *   node scripts/release.mjs notes <版號>         印出 CHANGELOG.md 該版段落（release.yml 用）
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const args = process.argv.slice(2);
const sh = (c) => execSync(c, { cwd: root, encoding: 'utf8' }).trim();
const PKGS = ['package.json', 'apps/api/package.json', 'apps/web/package.json', 'apps/server/package.json'];
const CHANGELOG = resolve(root, 'CHANGELOG.md');

function notes(version) {
  if (!existsSync(CHANGELOG)) return '';
  const s = readFileSync(CHANGELOG, 'utf8');
  const m = s.match(new RegExp(`^## \\[?v?${version.replace(/\./g, '\\.')}\\]?[^\\n]*\\n([\\s\\S]*?)(?=^## |\\Z)`, 'm'));
  return m ? m[1].trim() : '';
}

if (args[0] === 'notes') {
  process.stdout.write(notes(args[1] ?? '') + '\n');
  process.exit(0);
}

const version = args[0];
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error('usage: node scripts/release.mjs <x.y.z> [--no-push]');
  process.exit(1);
}
if (sh('git status --porcelain')) {
  console.error('工作樹不乾淨，先 commit 或 stash');
  process.exit(1);
}
for (const p of PKGS) {
  const f = resolve(root, p);
  const j = JSON.parse(readFileSync(f, 'utf8'));
  j.version = version;
  writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
}
let lastTag = '';
try {
  lastTag = sh('git describe --tags --abbrev=0');
} catch {
  lastTag = '';
}
const log = sh(`git log ${lastTag ? lastTag + '..HEAD' : ''} --pretty=format:%s`).split('\n').filter(Boolean).filter((l) => !/^(docs|ci)[:：]/.test(l));
const today = new Date().toISOString().slice(0, 10);
const section = `## v${version}（${today}）\n\n${log.map((l) => `- ${l}`).join('\n') || '- 維護性更新'}\n\n`;
const prev = existsSync(CHANGELOG) ? readFileSync(CHANGELOG, 'utf8') : '# CHANGELOG\n\n';
const head = prev.startsWith('# CHANGELOG') ? '# CHANGELOG\n\n' : '';
writeFileSync(CHANGELOG, head + section + prev.replace(/^# CHANGELOG\n\n?/, ''));
sh(`git add -A`);
sh(`git commit -q -m "release: v${version}"`);
sh(`git tag -a v${version} -m "SiteKit v${version}"`);
if (!args.includes('--no-push')) {
  sh('git push -q origin main');
  sh(`git push -q origin v${version}`);
  console.log(`v${version} 已推送；GitHub Actions release.yml 會建 GHCR 映像與發行包`);
} else console.log(`v${version} 已 commit＋tag（未推送）`);

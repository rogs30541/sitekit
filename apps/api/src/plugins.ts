import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { pluginRegistry, SettingsService, type SiteKitPlugin } from '@sitekit/core';

/** tsc（module commonjs）會把 import() 編成 require()，無法載入 file:// 與 ESM 外掛；用真正的動態 import */
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<Record<string, unknown>>;

/**
 * 外掛載入（Node 殼）：
 * - 清單來源：`SITEKIT_PLUGINS`（逗號分隔的套件名或路徑）＋ 從 cwd 往上找到的第一個 `sitekit.config.mjs`（export default { plugins: [] }）
 * - 每個項目 `import()` 後取 default（或具名 plugin）；壞掉的外掛只記錄，不影響啟動
 */
export async function loadPlugins(app: INestApplication) {
  const names = new Set<string>();
  for (const n of (process.env.SITEKIT_PLUGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) names.add(n);
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const cfg = resolve(dir, 'sitekit.config.mjs');
    if (existsSync(cfg)) {
      try {
        const m = (await dynamicImport(pathToFileURL(cfg).href)) as { default?: { plugins?: string[] } };
        for (const n of m.default?.plugins ?? []) names.add(n.startsWith('.') ? resolve(dir, n) : n);
      } catch (e) {
        pluginRegistry.markFailed(cfg, e instanceof Error ? e.message : String(e));
      }
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (!names.size) return;
  const prisma = app.get(PrismaClient);
  const settings = app.get(SettingsService);
  for (const name of names) {
    try {
      const spec = /^[A-Za-z]:[\\/]|^[\\/.]/.test(name) ? pathToFileURL(name).href : name;
      const mod = (await dynamicImport(spec)) as { default?: SiteKitPlugin; plugin?: SiteKitPlugin };
      const plugin = mod.default ?? mod.plugin;
      if (!plugin) throw new Error('模組沒有 default export');
      await pluginRegistry.register(plugin, name, { prisma, settings: { get: (k, d) => settings.get(k, undefined, d ?? ''), siteUrl: () => settings.siteUrl() } });
    } catch (e) {
      pluginRegistry.markFailed(name, e instanceof Error ? e.message : String(e));
    }
  }
}

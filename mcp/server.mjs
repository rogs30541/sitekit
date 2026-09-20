#!/usr/bin/env node
/**
 * SiteKit MCP server（MCP 路徑）
 * 讓訂閱制 AI 工具（Claude Desktop / Claude Code 等）透過 stdio 操作 SiteKit 的部署與更新。
 * 全部工具都轉發到 api 的 /api/ops/*，以 Bearer SITEKIT_OPS_TOKEN 驗證；不持有任何 cookie session。
 *
 * 環境變數：
 *   SITEKIT_API_URL    預設 http://localhost:4000
 *   SITEKIT_OPS_TOKEN  必填，與 apps/api 的 OPS_TOKEN 相同
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API = (process.env.SITEKIT_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const TOKEN = process.env.SITEKIT_OPS_TOKEN ?? '';

async function ops(action, params = {}) {
  if (!TOKEN) return { ok: false, error: 'SITEKIT_OPS_TOKEN 未設定' };
  const r = await fetch(`${API}/api/ops/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ action, params }),
  });
  const text = await r.text();
  try {
    return { status: r.status, ...JSON.parse(text) };
  } catch {
    return { status: r.status, ok: false, error: text.slice(0, 500) };
  }
}

const asText = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

const server = new McpServer({ name: 'sitekit', version: '0.1.0' });

server.tool('sitekit_status', '讀取 SiteKit 系統狀態（版本、環境、服務健康）', {}, async () => asText(await ops('status')));

server.tool(
  'sitekit_deploy',
  '觸發部署。target 為 web / api / all',
  { target: z.enum(['web', 'api', 'all']).default('all') },
  async ({ target }) => asText(await ops('deploy', { target })),
);

server.tool('sitekit_migrate', '執行資料庫遷移（prisma migrate deploy）', {}, async () => asText(await ops('migrate')));

server.tool('sitekit_get_settings', '讀取系統設定（機密值遮蔽）', {}, async () => asText(await ops('get_settings')));

server.tool(
  'sitekit_update_settings',
  '更新系統設定鍵值（例：brand.name、storage.driver、payment.provider）',
  { settings: z.record(z.string()) },
  async ({ settings }) => asText(await ops('update_settings', { settings })),
);

server.tool(
  'sitekit_import_content',
  '外站內容匯入（wordpress / csv），預設乾跑',
  { source: z.enum(['wordpress', 'csv']), sourceUrl: z.string().optional(), dryRun: z.boolean().default(true) },
  async ({ source, sourceUrl, dryRun }) => asText(await ops('import_content', { source, sourceUrl, dryRun })),
);

server.tool('sitekit_audit', '讀取最近的維運稽核日誌', { limit: z.number().int().min(1).max(200).default(50) }, async ({ limit }) =>
  asText(await ops('audit', { limit })),
);

const transport = new StdioServerTransport();
await server.connect(transport);

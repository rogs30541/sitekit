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
  '更新系統設定鍵值。金流：payment.methods（逗號清單，第一個為預設：newebpay,payuni,ecpay,linepay,pchomepay）、各家 <provider>.merchantId/hashKey/hashIv（LINE Pay 用 linepay.channelId/channelSecret；支付連用 pchomepay.appId/appSecret）、<provider>.testMode=true|false；其他：site.url、brand.name、ai.provider',
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

server.tool(
  'sitekit_sales_report',
  '銷售報表：期間營收、已付款訂單數、客單價、退款、折扣、運費、各商品銷量、金流分布（以付款時間計）',
  { from: z.string().optional().describe('YYYY-MM-DD，預設 30 天前'), to: z.string().optional().describe('YYYY-MM-DD，預設今天'), groupBy: z.enum(['day', 'month']).default('day') },
  async (p) => asText(await ops('sales_report', p)),
);

server.tool(
  'sitekit_update_shipping',
  '更新訂單物流狀態（只限已付款且需出貨的訂單）',
  { orderNo: z.string().describe('商店訂單編號 SK…'), status: z.enum(['pending', 'shipped', 'delivered', 'returned']), carrier: z.string().optional(), trackingNo: z.string().optional() },
  async (p) => asText(await ops('update_shipping', p)),
);

server.tool(
  'sitekit_manage_coupon',
  '折扣碼：建立（op=create）、修改（op=update）、停用（op=disable）',
  {
    op: z.enum(['create', 'update', 'disable']).default('create'),
    code: z.string().describe('代碼，會轉大寫'),
    type: z.enum(['percent', 'fixed']).optional(),
    value: z.number().int().optional().describe('percent＝百分比 1-100；fixed＝折抵元'),
    minAmount: z.number().int().optional(),
    maxUses: z.number().int().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
    note: z.string().optional(),
  },
  async (p) => asText(await ops('manage_coupon', p)),
);

server.tool(
  'sitekit_adjust_stock',
  '調整商品庫存：set 絕對值（null＝不追蹤）或 delta 增減',
  { sku: z.string().optional(), productId: z.string().optional(), set: z.number().int().nullable().optional(), delta: z.number().int().optional() },
  async (p) => asText(await ops('adjust_stock', p)),
);

server.tool('sitekit_expire_orders', '取消逾期未付款訂單並回補庫存', { hours: z.number().int().min(1).optional() }, async (p) => asText(await ops('expire_orders', p)));

server.tool(
  'sitekit_import_products',
  '商品 CSV 匯入（簡式 sku,name,price,type,description,cover_url,stock,active 或 Shopify 商品匯出檔）；以 sku 冪等 upsert，預設乾跑',
  { csv: z.string().optional(), filePath: z.string().optional(), dryRun: z.boolean().default(true), updateStock: z.boolean().default(false).describe('既有商品是否覆寫庫存') },
  async (p) => asText(await ops('import_products', p)),
);

const transport = new StdioServerTransport();
await server.connect(transport);

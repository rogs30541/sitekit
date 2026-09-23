/**
 * @sitekit/plugin-webhook — 官方外掛①：站台事件以簽章 JSON webhook 送到你指定的網址（Zapier／Make／n8n／Google Apps Script／自家系統）。
 * 設定（後台「系統功能 → 外掛」）：
 *   webhook.urls    逗號分隔的接收網址（https://…）
 *   webhook.secret  簽章密鑰；每次請求帶 `x-sitekit-signature: sha256=<HMAC-SHA256(body)>`、`x-sitekit-event`、`x-sitekit-delivery`
 *   webhook.events  逗號分隔要送的事件；空＝全部
 * OPS／MCP 動作：webhook_test（送一則 test 事件到所有網址，回每個網址的結果）
 */
import { createHmac, randomUUID } from 'node:crypto';

const ALL_EVENTS = ['user.registered', 'order.paid', 'order.shipped', 'order.refunded', 'content.published', 'sales_page.published', 'question.created', 'setup.completed'];

export default {
  id: 'webhook',
  name: 'Webhook 事件推送',
  version: '1.0.0',
  description: '把站台事件（付款、出貨、退款、註冊、發佈…）以簽章 JSON POST 到指定網址，接 Zapier／Make／n8n／自家系統。',
  settings: [
    { key: 'webhook.urls', label: '接收網址（逗號分隔）', placeholder: 'https://hooks.example.com/sitekit' },
    { key: 'webhook.secret', label: '簽章密鑰', secret: true, help: '接收端用 HMAC-SHA256(body) 比對 x-sitekit-signature 標頭' },
    { key: 'webhook.events', label: '只送這些事件（逗號分隔，空＝全部）', placeholder: ALL_EVENTS.join(',') },
  ],
  async register(ctx) {
    const deliver = async (event, data) => {
      const urls = (await ctx.settings.get('webhook.urls')).split(',').map((s) => s.trim()).filter((u) => /^https?:\/\//.test(u));
      if (!urls.length) return { sent: 0, results: [] };
      const only = (await ctx.settings.get('webhook.events')).split(',').map((s) => s.trim()).filter(Boolean);
      if (event !== 'test' && only.length && !only.includes(event)) return { sent: 0, results: [], skipped: event };
      const secret = await ctx.settings.get('webhook.secret');
      const site = await ctx.settings.siteUrl();
      const delivery = randomUUID();
      const body = JSON.stringify({ event, at: new Date().toISOString(), site, delivery, data });
      const signature = secret ? `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` : '';
      const results = await Promise.all(
        urls.map(async (url) => {
          try {
            const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sitekit-event': event, 'x-sitekit-delivery': delivery, ...(signature ? { 'x-sitekit-signature': signature } : {}) }, body, signal: AbortSignal.timeout(8000) });
            if (!r.ok) ctx.log.warn(`${event} → ${url} HTTP ${r.status}`);
            return { url, ok: r.ok, status: r.status };
          } catch (e) {
            ctx.log.warn(`${event} → ${url} 失敗：${e instanceof Error ? e.message : String(e)}`);
            return { url, ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
          }
        }),
      );
      return { sent: urls.length, delivery, results };
    };
    for (const ev of ALL_EVENTS) ctx.events.on(ev, (payload) => deliver(ev, payload));
    ctx.registerAction('webhook_test', {
      desc: 'Webhook 外掛：送一則 test 事件到所有接收網址，回每個網址的 HTTP 結果（用來驗證網址與簽章）',
      mutating: true,
      handler: async (params, actor) => deliver('test', { message: params.message ?? 'hello from sitekit', actor }),
    });
  },
};

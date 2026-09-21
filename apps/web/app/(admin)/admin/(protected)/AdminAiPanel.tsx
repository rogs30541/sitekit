'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OPS_ACTIONS, OPS_ACTION_KEYS } from '@sitekit/shared';

const PRESETS: Record<string, string> = {
  deploy: '{ "target": "all" }',
  update_settings: '{ "settings": { "brand.name": "SiteKit" } }',
  import_content: '{ "source": "csv", "dryRun": true, "csv": "external_id,title,slug,body,published_at,original_url\\n1,示範文章,demo,<p>內文</p>,2026-09-01,https://old.example.com/2026/09/demo" }',
  audit: '{ "limit": 20 }',
  sales_report: '{ "from": "2026-09-01", "to": "2026-09-30", "groupBy": "day" }',
  update_shipping: '{ "orderNo": "SK...", "status": "shipped", "carrier": "黑貓", "trackingNo": "1234567890" }',
  manage_coupon: '{ "op": "create", "code": "WELCOME10", "type": "percent", "value": 10, "minAmount": 500, "maxUses": 100 }',
  adjust_stock: '{ "sku": "SKU-001", "delta": 10 }',
  expire_orders: '{ "hours": 72 }',
  send_test_notification: '{ "to": "you@example.com" }',
  get_menu: '{}',
  set_menu: '{ "items": [ { "label": "官網", "kind": "route", "href": "/" }, { "label": "關於", "kind": "page", "contentId": "<contentId>" } ] }',
  list_questions: '{ "status": "open" }',
  answer_question: '{ "id": "<questionId>", "answer": "回覆內容" }',
  post_announcement: '{ "slug": "demo-course", "title": "公告標題", "body": "公告內容" }',
  upsert_content: '{ "slug": "about", "type": "page", "title": "關於我們", "body": "<p>內文</p>", "status": "published" }',
  list_content: '{ "type": "page" }',
  create_admin: '{ "email": "admin@your.domain", "password": "change-me-12345", "role": "admin" }',
  list_admins: '{}',
  update_admin: '{ "idOrEmail": "admin@your.domain", "password": "new-password-123" }',
  delete_admin: '{ "idOrEmail": "old-admin@your.domain" }',
  storage_status: '{}',
  import_products: '{ "dryRun": true, "csv": "sku,name,price,type,stock\\nSKU-001,示範商品,990,physical,20" }',
};

/** AI API 路徑：後台 UI 以 cookie session 呼叫 /api/admin/ai/act。之後在此接模型把自然語言規劃成 action+params。 */
export function AdminAiPanel() {
  const router = useRouter();
  const [action, setAction] = useState<string>('status');
  const [params, setParams] = useState<string>('{}');
  const [out, setOut] = useState<string>('');
  const [busy, setBusy] = useState(false);

  function pick(a: string) {
    setAction(a);
    setParams(PRESETS[a] ?? '{}');
  }

  async function act() {
    setBusy(true);
    try {
      const body = { action, params: JSON.parse(params || '{}') };
      const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      setOut(JSON.stringify(await r.json(), null, 2));
      router.refresh();
    } catch (e) {
      setOut(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const desc = OPS_ACTIONS[action as keyof typeof OPS_ACTIONS]?.desc ?? '';
  return (
    <div className="mt-4 rounded-lg border p-4" style={{ borderColor: 'var(--line)' }}>
      <p className="text-sm font-semibold">AI API 路徑（只接受後台 session）</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <select value={action} onChange={(e) => pick(e.target.value)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }}>
          {OPS_ACTION_KEYS.map((k) => (
            <option key={k} value={k}>
              {OPS_ACTIONS[k].desc.split('（')[0]}（{k}）
            </option>
          ))}
        </select>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {desc}
        </span>
        <button onClick={act} disabled={busy} className="rounded bg-black px-3 py-1 text-white disabled:opacity-50">
          {busy ? '執行中…' : '執行'}
        </button>
      </div>
      <textarea value={params} onChange={(e) => setParams(e.target.value)} rows={3} className="mt-2 w-full rounded border p-2 font-mono text-xs" style={{ borderColor: 'var(--line)' }} />
      <pre className="mt-3 max-h-64 overflow-auto rounded bg-neutral-100 p-3 text-xs">{out || '尚未執行'}</pre>
    </div>
  );
}

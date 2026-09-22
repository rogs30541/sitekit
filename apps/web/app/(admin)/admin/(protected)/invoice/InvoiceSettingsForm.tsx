'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS } from '@sitekit/shared';
import { fmtDateTime, twd } from '@/lib/api-public';

export interface InvoiceConfig {
  provider: 'none' | 'ezpay' | 'ecpay' | 'amego';
  timing: 'paid' | 'manual';
  ezpay: { ready: boolean; merchantId: string; testMode: boolean };
  ecpay: { ready: boolean; merchantId: string; testMode: boolean };
  amego: { ready: boolean; taxId: string; testMode: boolean };
}
export interface InvoiceRow {
  id: string;
  provider: string;
  number: string | null;
  status: string;
  amount: number;
  invoiceDate: string | null;
  createdAt: string;
  order: { merchantOrderNo: string; amount: number; invoiceType: string | null; invoiceTaxId: string | null; user: { email: string } };
}
const input = 'w-full rounded border px-2 py-1 text-sm';

export function InvoiceSettingsForm({ cfg, rows }: { cfg: InvoiceConfig; rows: InvoiceRow[] }) {
  const router = useRouter();
  const [provider, setProvider] = useState(cfg.provider);
  const [timing, setTiming] = useState(cfg.timing);
  const [ezTest, setEzTest] = useState(cfg.ezpay.testMode);
  const [ecTest, setEcTest] = useState(cfg.ecpay.testMode);
  const [ez, setEz] = useState({ merchantId: '', hashKey: '', hashIv: '' });
  const [ec, setEc] = useState({ merchantId: '', hashKey: '', hashIv: '' });
  const [am, setAm] = useState({ taxId: '', appKey: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const settings: Record<string, string> = { 'invoice.provider': provider, 'invoice.issueTiming': timing, 'ezpay.testMode': ezTest ? 'true' : 'false', 'ecpayInvoice.testMode': ecTest ? 'true' : 'false', 'ezpay.enabled': provider === 'ezpay' ? 'true' : 'false' };
    if (ez.merchantId.trim()) settings['ezpay.merchantId'] = ez.merchantId.trim();
    if (ez.hashKey.trim()) settings['ezpay.hashKey'] = ez.hashKey.trim();
    if (ez.hashIv.trim()) settings['ezpay.hashIv'] = ez.hashIv.trim();
    if (ec.merchantId.trim()) settings['ecpayInvoice.merchantId'] = ec.merchantId.trim();
    if (ec.hashKey.trim()) settings['ecpayInvoice.hashKey'] = ec.hashKey.trim();
    if (ec.hashIv.trim()) settings['ecpayInvoice.hashIv'] = ec.hashIv.trim();
    if (am.taxId.trim()) settings['amego.taxId'] = am.taxId.trim();
    if (am.appKey.trim()) settings['amego.appKey'] = am.appKey.trim();
    const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update_settings', params: { settings } }) });
    const j = await r.json().catch(() => ({}));
    setMsg(j.ok ? '已儲存發票設定。' : `失敗：${j.error ?? r.status}`);
    setEz({ merchantId: '', hashKey: '', hashIv: '' });
    setEc({ merchantId: '', hashKey: '', hashIv: '' });
    setAm({ taxId: '', appKey: '' });
    setBusy(false);
    router.refresh();
  }
  async function invalidate(orderNo: string) {
    if (!window.confirm(`作廢訂單 ${orderNo} 的發票？`)) return;
    const r = await fetch(`/api/admin/invoices/orders/${orderNo}/invalidate`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? '已作廢' : typeof j.message === 'string' ? j.message : '作廢失敗');
    router.refresh();
  }
  const Creds = ({ v, set, ready }: { v: { merchantId: string; hashKey: string; hashIv: string }; set: (x: typeof v) => void; ready: boolean }) => (
    <div className="mt-2 grid gap-2 sm:grid-cols-3">
      <label className="block text-xs">
        商店代號
        <input className={input} style={{ borderColor: 'var(--line)' }} autoComplete="off" value={v.merchantId} onChange={(e) => set({ ...v, merchantId: e.target.value })} />
      </label>
      <label className="block text-xs">
        HashKey
        <input className={input} style={{ borderColor: 'var(--line)' }} type="password" autoComplete="off" value={v.hashKey} onChange={(e) => set({ ...v, hashKey: e.target.value })} placeholder={ready ? '（已設定，留空不變）' : ''} />
      </label>
      <label className="block text-xs">
        HashIV
        <input className={input} style={{ borderColor: 'var(--line)' }} type="password" autoComplete="off" value={v.hashIv} onChange={(e) => set({ ...v, hashIv: e.target.value })} placeholder={ready ? '（已設定，留空不變）' : ''} />
      </label>
    </div>
  );
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <span className="font-semibold">供應商</span>
        <select value={provider} onChange={(e) => setProvider(e.target.value as InvoiceConfig['provider'])} className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }}>
          <option value="none">不開立</option>
          <option value="ezpay">藍新 ezPay 電子發票</option>
          <option value="ecpay">綠界電子發票</option>
          <option value="amego">光貿電子發票加值中心</option>
        </select>
        <span className="font-semibold">開立時機</span>
        <select value={timing} onChange={(e) => setTiming(e.target.value as 'paid' | 'manual')} className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }}>
          <option value="paid">付款成功自動開立</option>
          <option value="manual">人工在訂單頁開立</option>
        </select>
      </div>
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">藍新 ezPay</span>
          <span className={`rounded px-2 py-0.5 text-xs ${cfg.ezpay.ready ? 'bg-green-100 text-green-800' : 'bg-neutral-100'}`}>{cfg.ezpay.ready ? '已設定' : '未設定'}</span>
          {cfg.ezpay.merchantId ? <span className="font-mono text-xs">{cfg.ezpay.merchantId}</span> : null}
          <label className="ml-auto flex items-center gap-1 text-xs">
            <input type="checkbox" checked={ezTest} onChange={(e) => setEzTest(e.target.checked)} /> 測試環境（cinv）
          </label>
        </div>
        <Creds v={ez} set={setEz} ready={cfg.ezpay.ready} />
      </div>
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">綠界電子發票</span>
          <span className={`rounded px-2 py-0.5 text-xs ${cfg.ecpay.ready ? 'bg-green-100 text-green-800' : 'bg-neutral-100'}`}>{cfg.ecpay.ready ? '已設定' : '未設定'}</span>
          {cfg.ecpay.merchantId ? <span className="font-mono text-xs">{cfg.ecpay.merchantId}</span> : null}
          <label className="ml-auto flex items-center gap-1 text-xs">
            <input type="checkbox" checked={ecTest} onChange={(e) => setEcTest(e.target.checked)} /> 測試環境（einvoice-stage）
          </label>
        </div>
        <Creds v={ec} set={setEc} ready={cfg.ecpay.ready} />
      </div>
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">光貿電子發票（Amego）</span>
          <span className={`rounded px-2 py-0.5 text-xs ${cfg.amego.ready ? 'bg-green-100 text-green-800' : 'bg-neutral-100'}`}>{cfg.amego.ready ? (cfg.amego.testMode ? '已設定（測試公司）' : '已設定') : '未設定'}</span>
          {cfg.amego.taxId ? <span className="font-mono text-xs">{cfg.amego.taxId}</span> : null}
          <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
            測試與正式同一 API 網址；填測試公司統編與 App Key 即為測試
          </span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block text-xs">
            公司統一編號
            <input className={input} style={{ borderColor: 'var(--line)' }} autoComplete="off" value={am.taxId} onChange={(e) => setAm({ ...am, taxId: e.target.value.replace(/\D/g, '').slice(0, 8) })} placeholder={cfg.amego.taxId || '8 碼'} />
          </label>
          <label className="block text-xs">
            App Key（光貿後台 → 基本資料 → 公司資料 → API 資訊）
            <input className={input} style={{ borderColor: 'var(--line)' }} type="password" autoComplete="off" value={am.appKey} onChange={(e) => setAm({ ...am, appKey: e.target.value })} placeholder={cfg.amego.ready ? '（已設定，留空不變）' : ''} />
          </label>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
          儲存發票設定
        </button>
        {msg ? <span className="text-xs">{msg}</span> : null}
      </div>
      <div>
        <p className="mb-1 font-semibold">發票紀錄</p>
        <table className="w-full text-left text-xs">
          <thead>
            <tr style={{ color: 'var(--muted)' }}>
              <th className="py-1">發票號碼</th>
              <th className="py-1">訂單</th>
              <th className="py-1">買家</th>
              <th className="py-1">類型</th>
              <th className="py-1">金額</th>
              <th className="py-1">狀態</th>
              <th className="py-1">時間</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="py-1 font-mono">{r.number ?? '—'}</td>
                <td className="py-1 font-mono">{r.order.merchantOrderNo}</td>
                <td className="py-1">{r.order.user.email}</td>
                <td className="py-1">
                  {INVOICE_TYPE_LABELS[r.order.invoiceType ?? 'personal'] ?? r.order.invoiceType}
                  {r.order.invoiceTaxId ? ` ${r.order.invoiceTaxId}` : ''}
                </td>
                <td className="py-1">{twd(r.amount)}</td>
                <td className="py-1">
                  {INVOICE_STATUS_LABELS[r.status] ?? r.status}（{r.provider === 'ezpay' ? 'ezPay' : r.provider === 'amego' ? '光貿' : '綠界'}）
                </td>
                <td className="py-1">{fmtDateTime(r.createdAt)}</td>
                <td className="py-1">
                  {r.status === 'issued' ? (
                    <button onClick={() => invalidate(r.order.merchantOrderNo)} className="text-red-700 underline">
                      作廢
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={8} className="py-2" style={{ color: 'var(--muted)' }}>
                  尚無發票
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

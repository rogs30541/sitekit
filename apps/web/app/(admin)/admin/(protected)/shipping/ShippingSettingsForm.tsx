'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LOGISTICS_METHOD_LABELS } from '@sitekit/shared';

export interface LogisticsConfig {
  provider: string;
  ecpayReady: boolean;
  merchantId: string;
  testMode: boolean;
  methods: string[];
  sender: { name: string; phone: string; zip: string; address: string };
  manualFee: number;
  freeOver: number | null;
  fees: Record<string, number>;
}
const input = 'w-full rounded border px-2 py-1 text-sm';
const METHODS = Object.keys(LOGISTICS_METHOD_LABELS) as (keyof typeof LOGISTICS_METHOD_LABELS)[];

export function ShippingSettingsForm({ cfg }: { cfg: LogisticsConfig }) {
  const router = useRouter();
  const [provider, setProvider] = useState(cfg.provider === 'ecpay' ? 'ecpay' : 'none');
  const [testMode, setTestMode] = useState(cfg.testMode);
  const [methods, setMethods] = useState<string[]>(cfg.methods);
  const [fees, setFees] = useState<Record<string, string>>(Object.fromEntries(METHODS.map((m) => [m, String(cfg.fees[m] ?? (m === 'manual' ? cfg.manualFee : ''))])));
  const [freeOver, setFreeOver] = useState(cfg.freeOver === null ? '' : String(cfg.freeOver));
  const [sender, setSender] = useState(cfg.sender);
  const [creds, setCreds] = useState({ merchantId: '', hashKey: '', hashIv: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const settings: Record<string, string> = {
      'logistics.provider': provider,
      'ecpayLogistics.testMode': testMode ? 'true' : 'false',
      'logistics.methods': methods.join(','),
      'logistics.fees': METHODS.filter((m) => fees[m] !== '' && Number.isFinite(Number(fees[m]))).map((m) => `${m}=${Number(fees[m])}`).join(','),
      'shipping.fee': fees.manual !== '' ? String(Number(fees.manual) || 0) : '0',
      'shipping.freeOver': freeOver.trim(),
      'logistics.senderName': sender.name,
      'logistics.senderPhone': sender.phone,
      'logistics.senderZip': sender.zip,
      'logistics.senderAddress': sender.address,
    };
    if (creds.merchantId.trim()) settings['ecpayLogistics.merchantId'] = creds.merchantId.trim();
    if (creds.hashKey.trim()) settings['ecpayLogistics.hashKey'] = creds.hashKey.trim();
    if (creds.hashIv.trim()) settings['ecpayLogistics.hashIv'] = creds.hashIv.trim();
    const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update_settings', params: { settings } }) });
    const j = await r.json().catch(() => ({}));
    setMsg(j.ok ? '已儲存物流設定。' : `失敗：${j.error ?? r.status}`);
    setCreds({ merchantId: '', hashKey: '', hashIv: '' });
    setBusy(false);
    router.refresh();
  }
  const toggle = (m: string) => setMethods((x) => (x.includes(m) ? x.filter((y) => y !== m) : [...x, m]));

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">物流商</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }}>
            <option value="none">不串接（自行配送）</option>
            <option value="ecpay">綠界物流</option>
          </select>
          <span className={`rounded px-2 py-0.5 text-xs ${cfg.ecpayReady ? 'bg-green-100 text-green-800' : 'bg-neutral-100'}`}>{cfg.ecpayReady ? '綠界已設定' : '綠界未設定'}</span>
          {cfg.merchantId ? <span className="font-mono text-xs">{cfg.merchantId}</span> : null}
          <label className="ml-auto flex items-center gap-1 text-xs">
            <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} /> 測試環境（logistics-stage）
          </label>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="block text-xs">
            綠界物流 MerchantID
            <input className={input} style={{ borderColor: 'var(--line)' }} autoComplete="off" value={creds.merchantId} onChange={(e) => setCreds({ ...creds, merchantId: e.target.value })} placeholder={cfg.merchantId || ''} />
          </label>
          <label className="block text-xs">
            HashKey
            <input className={input} style={{ borderColor: 'var(--line)' }} type="password" autoComplete="off" value={creds.hashKey} onChange={(e) => setCreds({ ...creds, hashKey: e.target.value })} placeholder={cfg.ecpayReady ? '（已設定，留空不變）' : ''} />
          </label>
          <label className="block text-xs">
            HashIV
            <input className={input} style={{ borderColor: 'var(--line)' }} type="password" autoComplete="off" value={creds.hashIv} onChange={(e) => setCreds({ ...creds, hashIv: e.target.value })} placeholder={cfg.ecpayReady ? '（已設定，留空不變）' : ''} />
          </label>
        </div>
      </div>
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <p className="mb-2 font-semibold">配送方式與運費</p>
        <table className="w-full text-xs">
          <tbody>
            {METHODS.map((m) => (
              <tr key={m} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="py-1">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={methods.includes(m)} onChange={() => toggle(m)} /> {LOGISTICS_METHOD_LABELS[m]}
                    {m !== 'manual' && provider !== 'ecpay' ? <span style={{ color: 'var(--muted)' }}>（需綠界物流）</span> : null}
                  </label>
                </td>
                <td className="py-1">
                  <span className="flex items-center gap-1">
                    運費 NT$ <input className="w-20 rounded border px-1 py-0.5" style={{ borderColor: 'var(--line)' }} type="number" min={0} value={fees[m] ?? ''} onChange={(e) => setFees({ ...fees, [m]: e.target.value })} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="mt-2 flex items-center gap-2 text-xs">
          滿額免運（元，留空＝不免運）
          <input className="w-24 rounded border px-1 py-0.5" style={{ borderColor: 'var(--line)' }} type="number" min={0} value={freeOver} onChange={(e) => setFreeOver(e.target.value)} />
        </label>
      </div>
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <p className="mb-2 font-semibold">寄件人（建立物流單用）</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="block text-xs">
            姓名
            <input className={input} style={{ borderColor: 'var(--line)' }} value={sender.name} onChange={(e) => setSender({ ...sender, name: e.target.value })} />
          </label>
          <label className="block text-xs">
            手機
            <input className={input} style={{ borderColor: 'var(--line)' }} value={sender.phone} onChange={(e) => setSender({ ...sender, phone: e.target.value })} />
          </label>
          <label className="block text-xs">
            郵遞區號
            <input className={input} style={{ borderColor: 'var(--line)' }} value={sender.zip} onChange={(e) => setSender({ ...sender, zip: e.target.value })} />
          </label>
          <label className="block text-xs">
            地址（宅配寄件）
            <input className={input} style={{ borderColor: 'var(--line)' }} value={sender.address} onChange={(e) => setSender({ ...sender, address: e.target.value })} />
          </label>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
          儲存物流設定
        </button>
        {msg ? <span className="text-xs">{msg}</span> : null}
      </div>
    </div>
  );
}

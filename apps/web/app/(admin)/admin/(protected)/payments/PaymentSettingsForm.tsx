'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface PaymentConfig {
  defaultProvider: string;
  methods: string[];
  providers: { id: string; label: string; configured: boolean; testMode: boolean; merchantId: string; enabled: boolean }[];
}

/** 各供應商要填的欄位（settings 鍵）；機密欄位留空＝不變更 */
const FIELDS: Record<string, { key: string; label: string; secret?: boolean }[]> = {
  newebpay: [
    { key: 'newebpay.merchantId', label: 'MerchantID' },
    { key: 'newebpay.hashKey', label: 'HashKey', secret: true },
    { key: 'newebpay.hashIv', label: 'HashIV', secret: true },
  ],
  payuni: [
    { key: 'payuni.merchantId', label: '商店代號 MerID' },
    { key: 'payuni.hashKey', label: 'Hash Key', secret: true },
    { key: 'payuni.hashIv', label: 'Hash IV', secret: true },
  ],
  ecpay: [
    { key: 'ecpay.merchantId', label: 'MerchantID' },
    { key: 'ecpay.hashKey', label: 'HashKey', secret: true },
    { key: 'ecpay.hashIv', label: 'HashIV', secret: true },
  ],
  linepay: [
    { key: 'linepay.channelId', label: 'Channel ID' },
    { key: 'linepay.channelSecret', label: 'Channel Secret', secret: true },
  ],
  pchomepay: [
    { key: 'pchomepay.appId', label: 'APP ID' },
    { key: 'pchomepay.appSecret', label: 'APP Secret', secret: true },
  ],
};
const TEST_KEY: Record<string, string> = { newebpay: 'newebpay.testMode', payuni: 'payuni.testMode', ecpay: 'ecpay.testMode', linepay: 'linepay.testMode', pchomepay: 'pchomepay.testMode' };
const input = 'w-full rounded border px-2 py-1 text-sm';

export function PaymentSettingsForm({ config }: { config: PaymentConfig }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<string[]>(config.methods);
  const [values, setValues] = useState<Record<string, string>>({});
  const [test, setTest] = useState<Record<string, boolean>>(Object.fromEntries(config.providers.map((p) => [p.id, p.testMode])));
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState('');

  function toggle(id: string) {
    setEnabled((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
  }

  /** 走 AI API 路徑（cookie session）呼叫既有 update_settings；只送有填值的欄位。 */
  async function save() {
    setBusy(true);
    setOut('');
    const settings: Record<string, string> = { 'payment.methods': enabled.join(','), 'payment.provider': enabled[0] ?? 'none' };
    for (const [k, v] of Object.entries(values)) if (v.trim()) settings[k] = v.trim();
    for (const [id, key] of Object.entries(TEST_KEY)) settings[key] = test[id] === false ? 'false' : 'true';
    try {
      const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update_settings', params: { settings } }) });
      const j = await r.json();
      setOut(j.ok ? `已儲存：${(j.data?.updated ?? []).join('、')}` : `失敗：${j.error ?? j.message ?? r.status}`);
      setValues({});
      router.refresh();
    } catch (e) {
      setOut(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        勾選要在結帳頁提供的付款方式（第一個為預設）。回呼網址：<code>{'<site.url>/api/payments/<provider>/notify'}</code>，各家商店後台需設為公開 HTTPS。機密欄位留空代表不變更。
      </p>
      {config.providers.map((p) => (
        <div key={p.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1 font-semibold">
              <input type="checkbox" checked={enabled.includes(p.id)} onChange={() => toggle(p.id)} /> {p.label}
            </label>
            <span className={`rounded px-2 py-0.5 text-xs ${p.configured ? 'bg-green-100 text-green-800' : 'bg-neutral-100'}`}>{p.configured ? '已設定' : '未設定'}</span>
            {p.merchantId ? (
              <span className="font-mono text-xs" style={{ color: 'var(--muted)' }}>
                {p.merchantId}
              </span>
            ) : null}
            {TEST_KEY[p.id] ? (
              <label className="ml-auto flex items-center gap-1 text-xs">
                <input type="checkbox" checked={test[p.id] !== false} onChange={(e) => setTest({ ...test, [p.id]: e.target.checked })} /> 測試模式（沙箱）
              </label>
            ) : (
              <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>
                僅非正式環境可用
              </span>
            )}
          </div>
          {FIELDS[p.id] ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {FIELDS[p.id].map((f) => (
                <label key={f.key} className="block text-xs">
                  {f.label}
                  <input className={input} style={{ borderColor: 'var(--line)' }} type={f.secret ? 'password' : 'text'} autoComplete="off" placeholder={f.secret && p.configured ? '（已設定，留空不變）' : ''} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? '儲存中…' : '儲存金流設定'}
        </button>
        {out ? <span className="text-xs">{out}</span> : null}
      </div>
    </div>
  );
}

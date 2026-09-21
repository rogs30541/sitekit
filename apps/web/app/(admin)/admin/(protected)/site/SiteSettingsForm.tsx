'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { HomeSection } from '@/lib/site';

export interface SiteAdmin {
  fields: { key: string; label: string; value: string; placeholder: string }[];
  sections: HomeSection[];
}

export function SiteSettingsForm({ fields }: { fields: SiteAdmin['fields'] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update_settings', params: { settings: values } }) });
    const j = await r.json().catch(() => ({}));
    setMsg(j.ok ? '已儲存，前台 60 秒內更新。' : `失敗：${j.error ?? r.status}`);
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className="block text-xs">
            {f.label}
            {f.key === 'brand.footerText' || f.key === 'brand.description' ? (
              <textarea className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--line)' }} rows={2} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            ) : (
              <input className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--line)' }} type={f.key === 'brand.primaryColor' ? 'text' : 'text'} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
          儲存網站設定
        </button>
        {msg ? <span className="text-xs">{msg}</span> : null}
      </div>
    </div>
  );
}

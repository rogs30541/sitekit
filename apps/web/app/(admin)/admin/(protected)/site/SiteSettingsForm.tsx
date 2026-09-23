'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { uploadImage, UPLOAD_LIMIT_LABEL } from '@/lib/upload-image';
import { LOCALES } from '@sitekit/shared';
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
            ) : f.key === 'site.locale' ? (
              <select className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--line)' }} value={values[f.key] || 'zh-TW'} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                {LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            ) : f.key === 'brand.logoUrl' ? (
              <span className="flex flex-wrap items-center gap-2">
                <input className="min-w-0 flex-1 rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--line)' }} type="text" placeholder={f.placeholder || '貼上圖片網址，或按右側上傳'} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                <label className="cursor-pointer rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }}>
                  上傳圖片（≤{UPLOAD_LIMIT_LABEL}）
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      setMsg('上傳中…');
                      try {
                        const url = await uploadImage(file);
                        setValues((v) => ({ ...v, [f.key]: url }));
                        setMsg('Logo 已上傳，記得按「儲存」。');
                      } catch (err) {
                        setMsg(err instanceof Error ? err.message : '上傳失敗');
                      }
                    }}
                  />
                </label>
                {values[f.key] ? <img src={values[f.key]} alt="" className="h-8 max-w-[8rem] object-contain" /> : null}
              </span>
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

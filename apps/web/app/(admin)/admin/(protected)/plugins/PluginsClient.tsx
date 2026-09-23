'use client';

import { useState } from 'react';

export interface PluginRow {
  id: string;
  name: string;
  version: string;
  description?: string;
  settings: { key: string; label: string; secret?: boolean; placeholder?: string; help?: string }[];
  actions: string[];
  module: string;
  error?: string;
}
const line = { borderColor: 'var(--line)' } as const;
const input = 'w-full rounded border px-2 py-1 text-sm';

export function PluginsClient({ plugins, values: initial }: { plugins: PluginRow[]; values: Record<string, string> }) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  const act = async (action: string, params: Record<string, unknown>) => {
    const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, params }) });
    return (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: unknown };
  };
  const save = async (p: PluginRow) => {
    setBusy(p.id);
    const settings: Record<string, string> = {};
    for (const f of p.settings) {
      const v = values[f.key] ?? '';
      if (f.secret && v === '****') continue; // 未改的機密不送
      settings[f.key] = v;
    }
    const r = Object.keys(settings).length ? await act('update_settings', { settings }) : { ok: true };
    setMsg((m) => ({ ...m, [p.id]: r.ok ? '已儲存' : `儲存失敗：${r.error ?? ''}` }));
    setBusy('');
  };
  const run = async (p: PluginRow, action: string) => {
    setBusy(p.id);
    const r = await act(action, {});
    setMsg((m) => ({ ...m, [p.id]: `${action}：${r.ok ? JSON.stringify(r.data).slice(0, 300) : r.error}` }));
    setBusy('');
  };

  if (!plugins.length) return <p className="text-sm">尚未載入任何外掛。</p>;
  return (
    <div className="space-y-4">
      {plugins.map((p) => (
        <div key={p.id} className="rounded-lg border p-3 text-xs" style={line}>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-bold">{p.name}</span>
            <span style={{ color: 'var(--muted)' }}>
              {p.id}@{p.version} · {p.module}
            </span>
            {p.error ? <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-800">載入失敗：{p.error}</span> : <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800">已載入</span>}
          </div>
          {p.description ? <p className="mt-1" style={{ color: 'var(--muted)' }}>{p.description}</p> : null}
          {p.actions.length ? (
            <p className="mt-1">
              動作（OPS／MCP／AI API 路徑可用）：
              {p.actions.map((a) => (
                <button key={a} type="button" disabled={busy === p.id} onClick={() => void run(p, a)} className="ml-1 rounded border px-1.5 py-0.5 font-mono disabled:opacity-50" style={line} title="以空參數執行">
                  {a}
                </button>
              ))}
            </p>
          ) : null}
          {p.settings.length ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {p.settings.map((f) => (
                <label key={f.key} className="block">
                  {f.label}
                  <input className={input} style={line} type={f.secret ? 'password' : 'text'} autoComplete="off" placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
                  {f.help ? <span style={{ color: 'var(--muted)' }}>{f.help}</span> : null}
                </label>
              ))}
              <div className="sm:col-span-2">
                <button type="button" disabled={busy === p.id} onClick={() => void save(p)} className="rounded bg-black px-3 py-1.5 text-white disabled:opacity-50">
                  儲存設定
                </button>
                {msg[p.id] ? <span className="ml-2">{msg[p.id]}</span> : null}
              </div>
            </div>
          ) : msg[p.id] ? (
            <p className="mt-1">{msg[p.id]}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

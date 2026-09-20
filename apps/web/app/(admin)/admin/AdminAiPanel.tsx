'use client';

import { useState } from 'react';
import { OPS_ACTION_KEYS } from '@sitekit/shared';

/** AI API 路徑示範：後台 UI 以 cookie session 呼叫 /api/admin/ai/act（骨架版直接送 action，正式版先經模型規劃）。 */
export function AdminAiPanel() {
  const [action, setAction] = useState<string>('status');
  const [out, setOut] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function devLogin() {
    const r = await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    setOut(JSON.stringify(await r.json(), null, 2));
  }

  async function act() {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/ai/act', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, params: action === 'deploy' ? { target: 'all' } : {} }),
      });
      setOut(JSON.stringify(await r.json(), null, 2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border p-4" style={{ borderColor: 'var(--line)' }}>
      <p className="text-sm font-semibold">AI API 路徑示範（只接受後台 session）</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <button onClick={devLogin} className="rounded border px-3 py-1" style={{ borderColor: 'var(--line)' }}>
          開發用登入
        </button>
        <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }}>
          {OPS_ACTION_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <button onClick={act} disabled={busy} className="rounded bg-black px-3 py-1 text-white disabled:opacity-50">
          {busy ? '執行中…' : '執行'}
        </button>
      </div>
      <pre className="mt-3 max-h-64 overflow-auto rounded bg-neutral-100 p-3 text-xs">{out || '尚未執行'}</pre>
    </div>
  );
}

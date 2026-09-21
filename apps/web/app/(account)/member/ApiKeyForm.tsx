'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface KeyRow {
  provider: string;
  last4: string;
  enabled: boolean;
}

/** BYOK：自帶 OpenAI 金鑰，生成走自己的額度、不扣平台點數。金鑰加密存放，只回末四碼。 */
export function ApiKeyForm({ keys }: { keys: KeyRow[] }) {
  const router = useRouter();
  const current = keys.find((k) => k.provider === 'openai');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function call(method: string, body?: unknown) {
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/me/keys/openai', { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? '已更新' : (j.message ?? `HTTP ${r.status}`));
    setBusy(false);
    setApiKey('');
    router.refresh();
  }

  return (
    <div className="space-y-2 text-xs">
      <p>
        OpenAI 金鑰：{current ? `已設定（…${current.last4}）${current.enabled ? '，啟用中，生成不扣點' : '，已停用'}` : '未設定'}
      </p>
      <div className="flex flex-wrap gap-2">
        <input type="password" className="min-w-64 flex-1 rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }} placeholder="貼上你的 OpenAI 金鑰（sk-…）" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
        <button disabled={busy || apiKey.length < 20} onClick={() => call('PUT', { apiKey })} className="rounded bg-black px-3 py-1 text-white disabled:opacity-50">
          儲存並啟用
        </button>
        {current ? (
          <>
            <button disabled={busy} onClick={() => call('PATCH', { enabled: !current.enabled })} className="rounded border px-3 py-1" style={{ borderColor: 'var(--line)' }}>
              {current.enabled ? '停用' : '啟用'}
            </button>
            <button disabled={busy} onClick={() => call('DELETE')} className="rounded border px-3 py-1" style={{ borderColor: 'var(--line)' }}>
              移除
            </button>
          </>
        ) : null}
        <span style={{ color: 'var(--muted)' }}>{msg}</span>
      </div>
      <p style={{ color: 'var(--muted)' }}>金鑰加密保存、不回傳明文，只用於你的生成請求。</p>
    </div>
  );
}

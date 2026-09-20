'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/member';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isDev = process.env.NEXT_PUBLIC_APP_ENV !== 'production';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(mode === 'register' ? { email, password, displayName: displayName || undefined } : { email, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function devLogin() {
    const r = await fetch('/api/auth/dev-login', { method: 'POST' });
    if (r.ok) {
      router.push(next);
      router.refresh();
    } else setError('dev-login failed');
  }

  const input = 'w-full rounded border px-3 py-2 text-sm';
  return (
    <form onSubmit={submit} className="max-w-sm space-y-3">
      {mode === 'register' ? <input className={input} style={{ borderColor: 'var(--line)' }} placeholder="顯示名稱（選填）" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /> : null}
      <input className={input} style={{ borderColor: 'var(--line)' }} type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className={input} style={{ borderColor: 'var(--line)' }} type="password" required minLength={8} placeholder="密碼（至少 8 碼）" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
          {mode === 'login' ? '登入' : '註冊'}
        </button>
        {isDev ? (
          <button type="button" onClick={devLogin} className="rounded border px-3 py-2 text-xs" style={{ borderColor: 'var(--line)' }}>
            開發用管理員登入
          </button>
        ) : null}
      </div>
    </form>
  );
}

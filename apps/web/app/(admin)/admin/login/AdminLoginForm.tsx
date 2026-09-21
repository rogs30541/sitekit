'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/** 後台登入／初始化：admin_users 為空時顯示「建立第一位管理員」。 */
export function AdminLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/admin';
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isDev = process.env.NEXT_PUBLIC_APP_ENV !== 'production';

  useEffect(() => {
    fetch('/api/admin/auth/status')
      .then((r) => r.json())
      .then((j) => setNeedsBootstrap(!!j.needsBootstrap))
      .catch(() => setNeedsBootstrap(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch(needsBootstrap ? '/api/admin/auth/bootstrap' : '/api/admin/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(needsBootstrap ? { email, password, displayName: displayName || undefined } : { email, password }) });
      const j = await r.json();
      if (!r.ok) throw new Error(typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
      router.push(next.startsWith('/admin') ? next : '/admin');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function devLogin() {
    const r = await fetch('/api/admin/auth/dev-login', { method: 'POST' });
    if (r.ok) {
      router.push('/admin');
      router.refresh();
    } else setError('dev-login failed');
  }

  const input = 'w-full rounded border px-3 py-2 text-sm';
  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      {needsBootstrap ? (
        <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">尚未建立任何管理員：以下資料將成為第一位超級管理員（之後此入口自動關閉）。</p>
      ) : null}
      {needsBootstrap ? <input className={input} style={{ borderColor: 'var(--line)' }} placeholder="顯示名稱（選填）" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /> : null}
      <input className={input} style={{ borderColor: 'var(--line)' }} type="email" required autoComplete="username" placeholder="管理員 Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className={input} style={{ borderColor: 'var(--line)' }} type="password" required minLength={8} autoComplete="current-password" placeholder="密碼（至少 8 碼）" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button disabled={busy || needsBootstrap === null} className="w-full rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">
        {busy ? '處理中…' : needsBootstrap ? '建立管理員並登入' : '登入後台'}
      </button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {isDev ? (
        <button type="button" onClick={devLogin} className="w-full rounded border px-3 py-2 text-xs" style={{ borderColor: 'var(--line)' }}>
          開發用：一鍵登入 dev 管理員
        </button>
      ) : null}
    </form>
  );
}

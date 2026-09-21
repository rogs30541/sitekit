'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * 後台登入／註冊：註冊走 Email 驗證碼（第一位管理員或白名單 email 才收得到驗證碼；第一位自動成為 superadmin）。
 */
export function AdminLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/admin';
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const isDev = process.env.NEXT_PUBLIC_APP_ENV !== 'production';

  useEffect(() => {
    fetch('/api/admin/auth/status')
      .then((r) => r.json())
      .then((j) => {
        setNeedsBootstrap(!!j.needsBootstrap);
        if (j.needsBootstrap) setMode('register');
      })
      .catch(() => setNeedsBootstrap(false));
  }, []);

  const post = async (path: string, body: unknown) => {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
    return j;
  };
  const go = () => {
    router.push(next.startsWith('/admin') ? next : '/admin');
    router.refresh();
  };

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/api/admin/auth/login', { email, password });
      go();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const j = await post('/api/admin/auth/register/request', { email });
      setStep(2);
      setInfo(j.sent === false ? '若此 Email 具備管理員註冊資格，驗證碼已寄出。' : `驗證碼已寄到 ${email}（15 分鐘內有效）${j.devCode ? `，開發環境驗證碼：${j.devCode}` : ''}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await post('/api/admin/auth/register/confirm', { email, code, password, displayName: displayName || undefined });
      go();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  async function devLogin() {
    const r = await fetch('/api/admin/auth/dev-login', { method: 'POST' });
    if (r.ok) go();
    else setError('dev-login failed');
  }

  const input = 'w-full rounded border px-3 py-2 text-sm';
  return (
    <div className="mt-4">
      <div className="mb-3 flex gap-3 text-sm">
        <button type="button" onClick={() => (setMode('login'), setError(''))} className={mode === 'login' ? 'font-bold underline' : ''}>
          登入
        </button>
        <button type="button" onClick={() => (setMode('register'), setStep(1), setError(''))} className={mode === 'register' ? 'font-bold underline' : ''}>
          註冊管理員
        </button>
      </div>
      {mode === 'login' ? (
        <form onSubmit={login} className="space-y-3">
          <input className={input} style={{ borderColor: 'var(--line)' }} type="email" required autoComplete="username" placeholder="管理員 Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={input} style={{ borderColor: 'var(--line)' }} type="password" required minLength={8} autoComplete="current-password" placeholder="密碼" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button disabled={busy} className="w-full rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">
            {busy ? '處理中…' : '登入後台'}
          </button>
        </form>
      ) : step === 1 ? (
        <form onSubmit={requestCode} className="space-y-3">
          <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">{needsBootstrap ? '尚未建立任何管理員：完成 Email 驗證後，此帳號將成為第一位超級管理員。' : '只有超級管理員設定的白名單 Email（或網域）能完成註冊；驗證碼會寄到你的信箱。'}</p>
          <input className={input} style={{ borderColor: 'var(--line)' }} type="email" required placeholder="管理員 Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button disabled={busy} className="w-full rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">
            {busy ? '寄送中…' : '寄送驗證碼'}
          </button>
        </form>
      ) : (
        <form onSubmit={confirm} className="space-y-3">
          {info ? <p className="text-xs" style={{ color: 'var(--muted)' }}>{info}</p> : null}
          <input className={input} style={{ borderColor: 'var(--line)' }} inputMode="numeric" pattern="\d{6}" required placeholder="6 碼驗證碼" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          <input className={input} style={{ borderColor: 'var(--line)' }} placeholder="顯示名稱（選填）" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <input className={input} style={{ borderColor: 'var(--line)' }} type="password" required minLength={8} autoComplete="new-password" placeholder="設定密碼（至少 8 碼）" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button disabled={busy} className="w-full rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">
            {busy ? '建立中…' : '完成註冊並登入'}
          </button>
          <button type="button" onClick={() => setStep(1)} className="w-full text-xs underline">
            重新寄送驗證碼
          </button>
        </form>
      )}
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      {isDev ? (
        <button type="button" onClick={devLogin} className="mt-3 w-full rounded border px-3 py-2 text-xs" style={{ borderColor: 'var(--line)' }}>
          開發用：一鍵登入 dev 管理員
        </button>
      ) : null}
    </div>
  );
}

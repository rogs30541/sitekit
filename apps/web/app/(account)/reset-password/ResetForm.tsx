'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { t } from '@/lib/i18n';

export function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await fetch('/api/auth/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setError(typeof j.message === 'string' ? j.message : t('重設失敗'));
      return;
    }
    setDone(true);
  }
  if (!token) return <p className="text-red-700">{t('缺少重設 token，請從信件中的連結進入。')}</p>;
  if (done)
    return (
      <p>
        密碼已更新，請{' '}
        <Link href="/login" className="underline">
          {t('重新登入')}
        </Link>
        。
      </p>
    );
  return (
    <form onSubmit={submit} className="max-w-sm space-y-3">
      <input className="w-full rounded border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} type="password" required minLength={8} placeholder={t('新密碼（至少 8 碼）')} value={password} onChange={(e) => setPassword(e.target.value)} />
      <button disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
        {busy ? t('更新中…') : t('更新密碼')}
      </button>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </form>
  );
}

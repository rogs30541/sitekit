'use client';

import { useState } from 'react';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch('/api/auth/forgot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => undefined);
    setBusy(false);
    setDone(true);
  }
  if (done) return <p>若此 Email 已註冊，重設密碼的連結已寄出（1 小時內有效）。請檢查信箱。</p>;
  return (
    <form onSubmit={submit} className="max-w-sm space-y-3">
      <input className="w-full rounded border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }} type="email" required placeholder="註冊的 Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
        {busy ? '寄送中…' : '寄送重設連結'}
      </button>
    </form>
  );
}

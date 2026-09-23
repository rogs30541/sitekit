'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t } from '@/lib/i18n';

/** 會員個人資料：顯示名稱、變更密碼（第三方登入帳號可直接設定密碼）。 */
export function ProfileForm({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState('');
  const input = 'rounded border px-2 py-1 text-sm';

  async function saveName() {
    const r = await fetch('/api/auth/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: name }) });
    setMsg(r.ok ? t('名稱已更新') : t('更新失敗'));
    router.refresh();
  }
  async function changePassword() {
    const r = await fetch('/api/auth/change-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword: cur || undefined, newPassword: next }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? t('密碼已更新') : typeof j.message === 'string' ? j.message : t('更新失敗'));
    if (r.ok) {
      setCur('');
      setNext('');
    }
  }
  return (
    <div className="mt-4 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <input className={input} style={{ borderColor: 'var(--line)' }} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('顯示名稱')} />
        <button onClick={saveName} className="rounded border px-3 py-1" style={{ borderColor: 'var(--line)' }}>
          {t('更新名稱')}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className={input} style={{ borderColor: 'var(--line)' }} type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder={t('目前密碼（第三方登入者可留空）')} />
        <input className={input} style={{ borderColor: 'var(--line)' }} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder={t('新密碼（≥8）')} />
        <button onClick={changePassword} disabled={next.length < 8} className="rounded border px-3 py-1 disabled:opacity-50" style={{ borderColor: 'var(--line)' }}>
          {t('變更密碼')}
        </button>
      </div>
      {msg ? <p>{msg}</p> : null}
    </div>
  );
}

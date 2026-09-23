'use client';

import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.push('/');
        router.refresh();
      }}
      className="rounded border px-3 py-1 text-xs"
      style={{ borderColor: 'var(--line)' }}
    >
      {t('登出')}
    </button>
  );
}

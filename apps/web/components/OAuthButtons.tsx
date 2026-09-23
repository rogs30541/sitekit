'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { t } from '@/lib/i18n';

/** 第三方登入按鈕：只顯示後端已設定的供應商（/api/auth/oauth/providers）。 */
export function OAuthButtons() {
  const search = useSearchParams();
  const next = search.get('next') || '/member';
  const failed = search.get('oauth');
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    fetch('/api/auth/oauth/providers')
      .then((r) => (r.ok ? r.json() : []))
      .then(setProviders)
      .catch(() => setProviders([]));
  }, []);
  if (!providers.length && !failed) return null;
  return (
    <div className="mt-4 max-w-sm space-y-2">
      {failed ? <p className="text-xs text-red-700">{failed === 'suspended' ? '此帳號已停用。' : '第三方登入失敗，請再試一次。'}</p> : null}
      {providers.length ? (
        <>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {t('或使用第三方帳號')}
          </p>
          <div className="flex flex-wrap gap-2">
            {providers.map((p) => (
              <a key={p.id} href={`/api/auth/oauth/${p.id}/start?next=${encodeURIComponent(next)}`} className="rounded border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }}>
                以 {p.label} 登入
              </a>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

import Link from 'next/link';
import { LogoutButton } from '@/components/LogoutButton';
import { Section } from '@/components/Section';
import { getMe } from '@/lib/api-server';

export const metadata = { title: '會員中心', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function MemberPage() {
  const me = await getMe();
  if (!me?.authenticated || !me.user) {
    return (
      <Section title="會員中心" group="(account)">
        <p>
          請先{' '}
          <Link href="/login?next=/member" className="underline">
            登入
          </Link>
          。
        </p>
      </Section>
    );
  }
  const u = me.user;
  return (
    <Section title="會員中心" group="(account)">
      <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
        <dt style={{ color: 'var(--muted)' }}>Email</dt>
        <dd>{u.email}</dd>
        <dt style={{ color: 'var(--muted)' }}>名稱</dt>
        <dd>{u.displayName ?? '—'}</dd>
        <dt style={{ color: 'var(--muted)' }}>角色</dt>
        <dd>{u.role}</dd>
        <dt style={{ color: 'var(--muted)' }}>會員等級</dt>
        <dd>{u.membershipTier ?? '免費'}</dd>
        <dt style={{ color: 'var(--muted)' }}>可用功能</dt>
        <dd>{u.allowedFeatures.length ? u.allowedFeatures.join(', ') : '—'}</dd>
      </dl>
      <div className="mt-4 flex gap-2">
        <LogoutButton />
        {u.role !== 'user' ? (
          <Link href="/admin" className="rounded border px-3 py-1 text-xs" style={{ borderColor: 'var(--line)' }}>
            進入後台
          </Link>
        ) : null}
      </div>
    </Section>
  );
}

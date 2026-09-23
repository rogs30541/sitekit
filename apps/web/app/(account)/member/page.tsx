import Link from 'next/link';
import { LogoutButton } from '@/components/LogoutButton';
import { Section } from '@/components/Section';
import { LEDGER_TYPE_LABELS, REFUND_STATUS_LABELS, ROLE_LABELS, SHIPPING_LABELS } from '@sitekit/shared';
import { twd, type Order, fmtDateTime } from '@/lib/api-public';
import { apiServer, getMe } from '@/lib/api-server';
import { ProfileForm } from './ProfileForm';
import { RefundRequestButton } from './RefundRequestButton';
import { t } from '@/lib/i18n';

export const metadata = { title: '會員中心', robots: { index: false } };
export const dynamic = 'force-dynamic';

const LABEL = (): Record<Order['status'], string> => ({ pending: t('等待付款'), paid: t('已付款'), failed: t('失敗'), refunded: t('已退款'), canceled: t('已取消') });
interface Credits {
  stored: number;
  reserved: number;
  available: number;
}
interface Ledger {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
}

export default async function MemberPage() {
  const me = await getMe();
  if (!me?.authenticated || !me.user) {
    return (
      <Section title={t('會員中心')} group="(account)">
        <p>
          請先{' '}
          <Link href="/login?next=/member" className="underline">
            {t('登入')}
          </Link>
          。
        </p>
      </Section>
    );
  }
  const u = me.user;
  const [orders, credits, ledger, keys] = await Promise.all([
    apiServer<Order[]>('/api/orders/mine'),
    apiServer<Credits>('/api/credits/me'),
    apiServer<Ledger[]>('/api/credits/ledger?limit=20'),
    apiServer<{ provider: string; last4: string; enabled: boolean }[]>('/api/me/keys'),
  ]);
  return (
    <div className="space-y-4">
      <Section title={t('會員中心')} group="(account)">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
          <dt style={{ color: 'var(--muted)' }}>Email</dt>
          <dd>{u.email}</dd>
          <dt style={{ color: 'var(--muted)' }}>{t('名稱')}</dt>
          <dd>{u.displayName ?? '—'}</dd>
          <dt style={{ color: 'var(--muted)' }}>{t('角色')}</dt>
          <dd>{ROLE_LABELS[u.role] ?? u.role}</dd>
          <dt style={{ color: 'var(--muted)' }}>{t('會員等級')}</dt>
          <dd>{u.membershipTier ?? t('免費')}</dd>
        </dl>
        <div className="mt-4 flex gap-2">
          <LogoutButton />
        </div>
        <ProfileForm displayName={u.displayName ?? ''} />
      </Section>
      <Section title={t('點數')} group="(account)">
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            [t('可用'), credits?.available ?? 0],
            [t('持有'), credits?.stored ?? 0],
            [t('保留中'), credits?.reserved ?? 0],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {k}
              </p>
              <p className="text-xl font-bold">{v}</p>
            </div>
          ))}
        </div>
        <table className="mt-3 w-full text-left text-xs">
          <tbody>
            {(ledger ?? []).map((l) => (
              <tr key={l.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="py-1">{fmtDateTime(l.createdAt)}</td>
                <td className="py-1">{LEDGER_TYPE_LABELS[l.type] ?? l.type}</td>
                <td className={`py-1 text-right ${l.amount < 0 ? 'text-red-700' : 'text-green-700'}`}>{l.amount > 0 ? `+${l.amount}` : l.amount}</td>
                <td className="py-1 text-right">{l.balanceAfter}</td>
                <td className="py-1" style={{ color: 'var(--muted)' }}>
                  {l.reason}
                </td>
              </tr>
            ))}
            {!ledger?.length ? (
              <tr>
                <td className="py-2" style={{ color: 'var(--muted)' }}>
                  {t('尚無點數異動')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Section>
      <Section title={t('我的金鑰（BYOK）')} group="(account)">
      </Section>
      <Section title={t('我的訂單')} group="(account)">
        {orders?.length ? (
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: 'var(--muted)' }}>
                <th className="py-1">{t('訂單')}</th>
                <th className="py-1">{t('內容')}</th>
                <th className="py-1">{t('金額')}</th>
                <th className="py-1">{t('狀態')}</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t align-top" style={{ borderColor: 'var(--line)' }}>
                  <td className="py-2 font-mono">
                    {o.merchantOrderNo}
                    <br />
                    <span style={{ color: 'var(--muted)' }}>{fmtDateTime(o.createdAt)}</span>
                  </td>
                  <td className="py-2">{o.items.map((i) => `${i.name} × ${i.qty}`).join('、')}</td>
                  <td className="py-2">{twd(o.amount)}</td>
                  <td className="py-2">
                    {LABEL()[o.status]}
                    {o.refundStatus ? <span style={{ color: 'var(--muted)' }}>（退款{REFUND_STATUS_LABELS[o.refundStatus] ?? o.refundStatus}）</span> : null}
                    {o.status === 'pending' && o.virtualAccount ? <div style={{ color: 'var(--muted)' }}>ATM {o.virtualAccount}</div> : null}
                  </td>
                  <td className="py-2">
                    {o.shippingStatus ? (
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>
                        物流：{SHIPPING_LABELS[o.shippingStatus as keyof typeof SHIPPING_LABELS] ?? o.shippingStatus}
                        {o.carrier ? ` · ${o.carrier}` : ''}
                        {o.trackingNo ? ` · ${o.trackingNo}` : ''}
                      </div>
                    ) : null}
                    {o.status === 'paid' && !o.refundStatus ? <RefundRequestButton orderNo={o.merchantOrderNo} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--muted)' }}>{t('尚無訂單。')}</p>
        )}
      </Section>
    </div>
  );
}

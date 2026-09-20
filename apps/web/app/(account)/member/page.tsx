import Link from 'next/link';
import { LogoutButton } from '@/components/LogoutButton';
import { Section } from '@/components/Section';
import { twd, type Order } from '@/lib/api-public';
import { apiServer, getMe } from '@/lib/api-server';
import { RefundRequestButton } from './RefundRequestButton';

export const metadata = { title: '會員中心', robots: { index: false } };
export const dynamic = 'force-dynamic';

const LABEL: Record<Order['status'], string> = { pending: '等待付款', paid: '已付款', failed: '失敗', refunded: '已退款', canceled: '已取消' };

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
  const orders = (await apiServer<Order[]>('/api/orders/mine')) ?? [];
  return (
    <div className="space-y-4">
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
      <Section title="我的訂單" group="(account)">
        {orders.length ? (
          <table className="w-full text-left text-xs">
            <thead>
              <tr style={{ color: 'var(--muted)' }}>
                <th className="py-1">訂單</th>
                <th className="py-1">內容</th>
                <th className="py-1">金額</th>
                <th className="py-1">狀態</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t align-top" style={{ borderColor: 'var(--line)' }}>
                  <td className="py-2 font-mono">
                    {o.merchantOrderNo}
                    <br />
                    <span style={{ color: 'var(--muted)' }}>{new Date(o.createdAt).toLocaleString('zh-TW')}</span>
                  </td>
                  <td className="py-2">{o.items.map((i) => `${i.name} × ${i.qty}`).join('、')}</td>
                  <td className="py-2">{twd(o.amount)}</td>
                  <td className="py-2">
                    {LABEL[o.status]}
                    {o.refundStatus ? <span style={{ color: 'var(--muted)' }}>（退款 {o.refundStatus}）</span> : null}
                    {o.status === 'pending' && o.virtualAccount ? <div style={{ color: 'var(--muted)' }}>ATM {o.virtualAccount}</div> : null}
                  </td>
                  <td className="py-2">{o.status === 'paid' && !o.refundStatus ? <RefundRequestButton orderNo={o.merchantOrderNo} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: 'var(--muted)' }}>尚無訂單。</p>
        )}
      </Section>
    </div>
  );
}

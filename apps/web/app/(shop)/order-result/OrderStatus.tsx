'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { paymentLabel } from '@sitekit/shared';
import { twd, type Order } from '@/lib/api-public';

const LABEL: Record<Order['status'], string> = { pending: '等待付款', paid: '付款成功', failed: '付款失敗', refunded: '已退款', canceled: '已取消' };

/** 導回頁只讀狀態（每 3 秒輪詢到 paid 或 failed），授權由伺服器回呼寫入。 */
export function OrderStatus() {
  const search = useSearchParams();
  const no = search.get('order');
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!no) return;
    let stop = false;
    async function tick() {
      const r = await fetch(`/api/orders/${encodeURIComponent(no as string)}`);
      if (!r.ok) {
        setError(r.status === 401 ? '請先登入' : '找不到訂單');
        return;
      }
      const o = (await r.json()) as Order;
      if (stop) return;
      setOrder(o);
      if (o.status === 'pending') setTimeout(tick, 3000);
    }
    tick();
    return () => {
      stop = true;
    };
  }, [no]);

  if (search.get('error')) return <p className="text-red-700">付款資料驗證失敗，請至會員中心確認訂單狀態。</p>;
  if (!no) return <p>缺少訂單編號。</p>;
  if (error) return <p className="text-red-700">{error}</p>;
  if (!order) return <p style={{ color: 'var(--muted)' }}>讀取中…</p>;
  return (
    <div className="space-y-2 text-sm">
      <p className="text-lg font-bold">{LABEL[order.status]}</p>
      <p className="font-mono text-xs" style={{ color: 'var(--muted)' }}>
        {order.merchantOrderNo}
      </p>
      <ul>
        {order.items.map((i) => (
          <li key={i.id}>
            {i.name} × {i.qty}
          </li>
        ))}
      </ul>
      <p>金額 {twd(order.amount)}</p>
      {order.provider && order.provider !== 'free' ? <p style={{ color: 'var(--muted)' }}>付款方式：{paymentLabel(order.provider, order.paymentType)}</p> : null}
      {order.status === 'pending' && order.virtualAccount ? <p>ATM 虛擬帳號 {order.virtualAccount}，請於期限前完成轉帳。</p> : null}
      {order.status === 'pending' && !order.virtualAccount ? <p style={{ color: 'var(--muted)' }}>等待金流回呼中…</p> : null}
      <p className="pt-2">
        <Link href="/member" className="underline">
          前往會員中心
        </Link>
        {' · '}
        <Link href="/courses" className="underline">
          回課程列表
        </Link>
      </p>
    </div>
  );
}

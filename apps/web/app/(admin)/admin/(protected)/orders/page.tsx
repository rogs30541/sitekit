import Link from 'next/link';
import { Section } from '@/components/Section';
import { INVOICE_TYPE_LABELS, LOGISTICS_METHOD_LABELS, ORDER_STATUS_LABELS, REFUND_STATUS_LABELS, SHIPPING_LABELS, paymentLabel } from '@sitekit/shared';
import { twd, type Order, fmtDateTime } from '@/lib/api-public';
import { apiServer } from '@/lib/api-server';
import { OrderActions } from './OrderActions';

export const dynamic = 'force-dynamic';

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; shipping?: string }> }) {
  const { status, shipping } = await searchParams;
  const q = new URLSearchParams({ ...(status ? { status } : {}), ...(shipping ? { shipping } : {}) }).toString();
  const orders = (await apiServer<Order[]>(`/api/admin/orders${q ? `?${q}` : ''}`)) ?? [];
  const filters = ['', 'pending', 'paid', 'refunded', 'failed', 'canceled'];
  return (
    <Section title="訂單管理" group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        {filters.map((f) => (
          <Link key={f || 'all'} href={f ? `/admin/orders?status=${f}` : '/admin/orders'} className={`mr-3 underline ${f === (status ?? '') ? 'font-bold' : ''}`}>
            {f ? ORDER_STATUS_LABELS[f as keyof typeof ORDER_STATUS_LABELS] : '全部'}
          </Link>
        ))}
        {' · '}
        <Link href="/admin/orders?shipping=pending" className="underline">
          待出貨
        </Link>
        {' · '}
        <Link href="/admin/reports" className="underline">
          報表／對帳檔
        </Link>
        {' · '}
        <Link href="/admin" className="underline">
          回總覽
        </Link>
      </p>
      <table className="w-full text-left text-xs">
        <thead>
          <tr style={{ color: 'var(--muted)' }}>
            <th className="py-1">訂單</th>
            <th className="py-1">買家</th>
            <th className="py-1">內容</th>
            <th className="py-1">金額</th>
            <th className="py-1">狀態</th>
            <th className="py-1">操作</th>
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
              <td className="py-2">{o.user?.email}</td>
              <td className="py-2">{o.items.map((i) => `${i.name} × ${i.qty}`).join('、')}</td>
              <td className="py-2">
                {twd(o.amount)}
                {o.discount ? <div style={{ color: 'var(--muted)' }}>折 {twd(o.discount)}{o.couponCode ? ` ${o.couponCode}` : ''}</div> : null}
                {o.shippingFee ? <div style={{ color: 'var(--muted)' }}>運費 {twd(o.shippingFee)}</div> : null}
              </td>
              <td className="py-2">
                {ORDER_STATUS_LABELS[o.status] ?? o.status}
                {o.provider ? <div style={{ color: 'var(--muted)' }}>{paymentLabel(o.provider, o.paymentType)}</div> : null}
                {o.invoiceType ? <div style={{ color: 'var(--muted)' }}>發票：{INVOICE_TYPE_LABELS[o.invoiceType] ?? o.invoiceType}{o.invoiceTaxId ? ` ${o.invoiceTaxId}` : ''}{o.invoices?.[0]?.number ? ` · ${o.invoices[0].number}` : ''}</div> : null}
                {o.refundStatus ? <div style={{ color: 'var(--muted)' }}>退款：{REFUND_STATUS_LABELS[o.refundStatus] ?? o.refundStatus}</div> : null}
                {o.shippingStatus ? (
                  <div style={{ color: 'var(--muted)' }}>
                    物流：{SHIPPING_LABELS[o.shippingStatus as keyof typeof SHIPPING_LABELS] ?? o.shippingStatus}
                    {o.shippingMethod ? ` · ${LOGISTICS_METHOD_LABELS[o.shippingMethod as keyof typeof LOGISTICS_METHOD_LABELS] ?? o.shippingMethod}` : ''}
                    {o.trackingNo ? ` ${o.trackingNo}` : ''}
                    <br />
                    {o.shippingName} {o.shippingPhone}
                    <br />
                    {o.cvsStoreName ? `${o.cvsStoreName}（${o.cvsStoreId}）` : o.shippingAddress}
                    {o.logisticsId ? <><br />物流單 {o.logisticsId}{o.logisticsPaymentNo ? ` 寄件代碼 ${o.logisticsPaymentNo}` : ''}</> : null}
                  </div>
                ) : null}
              </td>
              <td className="py-2">
                <OrderActions order={o} />
              </td>
            </tr>
          ))}
          {!orders.length ? (
            <tr>
              <td colSpan={6} className="py-2" style={{ color: 'var(--muted)' }}>
                無訂單
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Section>
  );
}

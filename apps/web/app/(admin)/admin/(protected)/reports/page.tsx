import Link from 'next/link';
import { Section } from '@/components/Section';
import { PROVIDER_LABELS } from '@sitekit/shared';
import { twd } from '@/lib/api-public';
import { apiServer } from '@/lib/api-server';

export const dynamic = 'force-dynamic';

interface Sales {
  from: string;
  to: string;
  groupBy: string;
  summary: { orders: number; revenue: number; netRevenue: number; discount: number; shipping: number; refunds: number; refundTotal: number; avgOrderValue: number; pendingOrders: number };
  series: { period: string; revenue: number; orders: number }[];
  byProduct: { productId: string; name: string; qty: number; revenue: number }[];
  byProvider: { provider: string; orders: number; revenue: number }[];
}

/** 銷售報表（同 MCP sales_report 資料）＋對帳檔下載。 */
export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; groupBy?: string }> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>).toString();
  const data = await apiServer<Sales>(`/api/admin/reports/sales${qs ? `?${qs}` : ''}`);
  const s = data?.summary;
  const stat = (label: string, value: string | number) => (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {label}
      </p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
  return (
    <Section title="銷售報表" group="(admin)">
      <form className="mb-4 flex flex-wrap items-end gap-2 text-xs">
        <label>
          起
          <br />
          <input type="date" name="from" defaultValue={sp.from ?? ''} className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }} />
        </label>
        <label>
          迄
          <br />
          <input type="date" name="to" defaultValue={sp.to ?? ''} className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }} />
        </label>
        <label>
          分組
          <br />
          <select name="groupBy" defaultValue={sp.groupBy ?? 'day'} className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }}>
            <option value="day">日</option>
            <option value="month">月</option>
          </select>
        </label>
        <button className="rounded bg-black px-3 py-1.5 text-white">查詢</button>
        <a href={`/api/admin/orders/export.csv${qs ? `?${qs}` : ''}`} className="underline">
          下載對帳檔 CSV
        </a>
        <Link href="/admin" className="underline">
          回總覽
        </Link>
      </form>
      {s ? (
        <>
          <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
            期間 {data!.from.slice(0, 10)} ～ {data!.to.slice(0, 10)}（以付款時間計）
          </p>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {stat('營收', twd(s.revenue))}
            {stat('淨營收（扣退款）', twd(s.netRevenue))}
            {stat('已付款訂單', s.orders)}
            {stat('客單價', twd(s.avgOrderValue))}
            {stat('退款', `${s.refunds} 筆 ${twd(s.refundTotal)}`)}
            {stat('折扣', twd(s.discount))}
            {stat('運費收入', twd(s.shipping))}
            {stat('待付款訂單', s.pendingOrders)}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div>
              <p className="mb-1 text-sm font-semibold">依{data!.groupBy === 'month' ? '月' : '日'}</p>
              <table className="w-full text-xs">
                <tbody>
                  {data!.series.map((r) => (
                    <tr key={r.period} className="border-t" style={{ borderColor: 'var(--line)' }}>
                      <td className="py-1">{r.period}</td>
                      <td className="py-1 text-right">{r.orders} 筆</td>
                      <td className="py-1 text-right">{twd(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold">商品銷量</p>
              <table className="w-full text-xs">
                <tbody>
                  {data!.byProduct.map((r) => (
                    <tr key={r.productId} className="border-t" style={{ borderColor: 'var(--line)' }}>
                      <td className="py-1">{r.name}</td>
                      <td className="py-1 text-right">{r.qty} 件</td>
                      <td className="py-1 text-right">{twd(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold">金流分布</p>
              <table className="w-full text-xs">
                <tbody>
                  {data!.byProvider.map((r) => (
                    <tr key={r.provider} className="border-t" style={{ borderColor: 'var(--line)' }}>
                      <td className="py-1">{PROVIDER_LABELS[r.provider] ?? r.provider}</td>
                      <td className="py-1 text-right">{r.orders} 筆</td>
                      <td className="py-1 text-right">{twd(r.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <p className="text-red-700">讀取報表失敗。</p>
      )}
    </Section>
  );
}

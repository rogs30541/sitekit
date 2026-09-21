import { fmtDateTime } from '@/lib/api-public';
import Link from 'next/link';
import { OPS_ACTIONS } from '@sitekit/shared';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { AdminAiPanel } from './AdminAiPanel';

interface Overview {
  users: number;
  contents: number;
  drafts: number;
  orders: number;
  paidOrders: number;
  redirects: number;
  settings: number;
}
interface Audit {
  id: string;
  actor: string;
  action: string;
  ok: boolean;
  error: string | null;
  createdAt: string;
}

export default async function AdminPage() {
  const [overview, audit] = await Promise.all([apiServer<Overview>('/api/admin/overview'), apiServer<Audit[]>('/api/admin/audit?limit=15')]);
  const stats = overview
    ? [
        ['用戶', overview.users],
        ['已發布內容', overview.contents],
        ['草稿', overview.drafts],
        ['訂單', overview.orders],
        ['已付款', overview.paidOrders],
        ['301 導向', overview.redirects],
        ['設定鍵', overview.settings],
      ]
    : [];
  return (
    <div className="space-y-4">
      <Section title="後台總覽" group="(admin)">
        <p className="mb-3 text-xs">
          <Link href="/admin/products" className="underline">
            商品管理
          </Link>
          {' · '}
          <Link href="/admin/coupons" className="underline">
            折扣碼
          </Link>
          {' · '}
          <Link href="/admin/reports" className="underline">
            銷售報表
          </Link>
          {' · '}
          <Link href="/admin/payments" className="underline">
            金流設定
          </Link>
          {' · '}
          <Link href="/admin/integrations" className="underline">
            儲存與通知
          </Link>
          {' · '}
          <Link href="/admin/orders" className="underline">
            訂單管理
          </Link>
          {" · "}
          <Link href="/admin/courses" className="underline">
            課程管理
          </Link>
          {" · "}
          <Link href="/admin/studio" className="underline">
            AI 工作站
          </Link>
        </p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-7">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                {k}
              </p>
              <p className="text-xl font-bold">{v}</p>
            </div>
          ))}
        </div>
        <AdminAiPanel />
      </Section>
      <Section title="維運稽核（MCP 與 AI API 兩路徑共用）" group="(admin)">
        <table className="w-full text-left text-xs">
          <thead>
            <tr style={{ color: 'var(--muted)' }}>
              <th className="py-1">時間</th>
              <th className="py-1">actor</th>
              <th className="py-1">動作</th>
              <th className="py-1">結果</th>
            </tr>
          </thead>
          <tbody>
            {(audit ?? []).map((a) => (
              <tr key={a.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="py-1">{fmtDateTime(a.createdAt)}</td>
                <td className="py-1 font-mono">{a.actor}</td>
                <td className="py-1 font-mono">{a.action}</td>
                <td className="py-1">{a.ok ? '成功' : `失敗：${a.error ?? ''}`}</td>
              </tr>
            ))}
            {!audit?.length ? (
              <tr>
                <td colSpan={4} className="py-2" style={{ color: 'var(--muted)' }}>
                  尚無紀錄
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
          可用動作：{Object.keys(OPS_ACTIONS).join('、')}
        </p>
      </Section>
    </div>
  );
}

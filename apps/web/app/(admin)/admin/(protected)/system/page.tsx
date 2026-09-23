import { fmtDateTime } from '@/lib/api-public';
import Link from 'next/link';
import { OPS_ACTIONS } from '@sitekit/shared';
import { Section } from '@/components/Section';
import { apiServer, getAdminMe } from '@/lib/api-server';
import { AdminAiPanel } from '../AdminAiPanel';
import { SystemHealthPanel } from './SystemHealthPanel';
import { SystemBackupPanel } from './SystemBackupPanel';

export const dynamic = 'force-dynamic';

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

/** 系統設定：總覽數字、AI API 路徑（直接執行維運動作，含系統功能）、維運稽核。原「總覽」內容移到這裡。 */
export default async function AdminSystemPage() {
  const [overview, audit, me] = await Promise.all([apiServer<Overview>('/api/admin/overview'), apiServer<Audit[]>('/api/admin/audit?limit=15'), getAdminMe()]);
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
      <Section title="系統設定" group="(admin)">
        <p className="mb-3 text-xs">
          <Link href="/admin/integrations" className="underline">
            儲存與通知
          </Link>
          {' · '}
          <Link href="/admin/accounts" className="underline">
            管理員
          </Link>
          {' · '}
          <Link href="/admin/studio" className="underline">
            AI 工作站（指令台）
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
        <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
          下方「AI API 路徑」可直接執行任何維運動作（含部署、遷移、設定、管理員等系統功能）；一般工作請改用 AI 工作站指令台（自然語言、寫入需確認）。
        </p>
        <AdminAiPanel />
      </Section>
      <Section title="健康檢查與支援" group="(admin)">
        <SystemHealthPanel isSuperadmin={me?.admin?.role === 'superadmin'} />
      </Section>
      <Section title="備份與還原" group="(admin)">
        <SystemBackupPanel isSuperadmin={me?.admin?.role === 'superadmin'} />
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
                <td className="py-1 font-mono">{OPS_ACTIONS[a.action as keyof typeof OPS_ACTIONS]?.desc.split('（')[0] ?? a.action}</td>
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

import { OPS_ACTIONS } from '@sitekit/shared';
import { Section } from '@/components/Section';
import { AdminAiPanel } from './AdminAiPanel';

export default function AdminPage() {
  const actions = Object.entries(OPS_ACTIONS);
  return (
    <Section title="後台總覽" group="(admin)">
      <p>後台維運動作由 MCP 路徑與 AI API 路徑共用，清單來自 packages/shared 的 OPS_ACTIONS。</p>
      <table className="mt-4 w-full text-left text-xs">
        <thead>
          <tr style={{ color: 'var(--muted)' }}>
            <th className="py-1">動作</th>
            <th className="py-1">說明</th>
            <th className="py-1">會改動狀態</th>
          </tr>
        </thead>
        <tbody>
          {actions.map(([k, v]) => (
            <tr key={k} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <td className="py-1 font-mono">{k}</td>
              <td className="py-1">{v.desc}</td>
              <td className="py-1">{v.mutating ? '是' : '否'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <AdminAiPanel />
    </Section>
  );
}

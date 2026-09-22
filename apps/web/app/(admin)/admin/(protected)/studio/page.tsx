import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { AdminStudioClient, type AdminTemplate, type AdminJob } from './AdminStudioClient';
import { CommandConsole, type CommandConfig } from './CommandConsole';

export const dynamic = 'force-dynamic';

const FALLBACK: CommandConfig = { provider: 'mock', model: 'rules', ready: true, anthropicConfigured: false, openaiConfigured: false, tasks: [], actions: [] };

/** AI 工作站＝後台全站工作總控（指令台）；前台不顯示。下方保留圖片模板／任務管理。 */
export default async function AdminStudioPage() {
  const [config, templates, jobs] = await Promise.all([apiServer<CommandConfig>('/api/admin/ai/command/config'), apiServer<AdminTemplate[]>('/api/admin/studio/templates'), apiServer<AdminJob[]>('/api/admin/studio/jobs?limit=50')]);
  return (
    <div className="space-y-4">
      <Section title="AI 工作站（指令台）" group="(admin)">
        <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
          後台全站工作總控：用自然語言操作前端頁面、電商訂單、報表、商品製圖、商品／課程上架與 Banner 設計。寫入動作一律先列出待確認，頁面一律先存草稿、給預覽、再確認發佈。系統功能（部署／遷移／設定／管理員）不在此開放。
        </p>
        <CommandConsole config={config ?? FALLBACK} />
      </Section>
      <details className="rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
        <summary className="cursor-pointer text-sm font-semibold">進階：AI 產圖模板與任務管理</summary>
        <div className="mt-3 text-sm">
          <AdminStudioClient templates={templates ?? []} jobs={jobs ?? []} />
        </div>
      </details>
    </div>
  );
}

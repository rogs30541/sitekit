import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { AdminStudioClient, type AdminTemplate, type AdminJob } from './AdminStudioClient';
import { CommandConsole, type CommandConfig } from './CommandConsole';
import { ImageStudio, type AiTemplate } from './ImageStudio';
import { StudioTabs } from './StudioTabs';

export const dynamic = 'force-dynamic';

const FALLBACK: CommandConfig = { provider: 'mock', model: 'rules', ready: true, anthropicConfigured: false, openaiConfigured: false, tasks: [], actions: [] };

/** AI 工作站＝後台全站工作總控：指令台／產圖（inShow 版面）／模板與任務管理；前台不提供工作站。 */
export default async function AdminStudioPage() {
  const [config, templates, adminTemplates, jobs] = await Promise.all([apiServer<CommandConfig>('/api/admin/ai/command/config'), apiServer<AiTemplate[]>('/api/studio/templates'), apiServer<AdminTemplate[]>('/api/admin/studio/templates'), apiServer<AdminJob[]>('/api/admin/studio/jobs?limit=50')]);
  return (
    <Section title="AI 工作站" group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        後台全站工作總控：指令台用自然語言操作全站（寫入需確認）；產圖以 20 組模板＋參考圖生成商品圖／Banner；模板與任務管理可編輯模板與查看所有任務。
      </p>
      <StudioTabs command={<CommandConsole config={config ?? FALLBACK} />} images={<ImageStudio templates={templates ?? []} />} manage={<AdminStudioClient templates={adminTemplates ?? []} jobs={jobs ?? []} />} />
    </Section>
  );
}

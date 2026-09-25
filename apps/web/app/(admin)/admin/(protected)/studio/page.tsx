import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { AdminStudioClient, type AdminTemplate, type AdminJob } from './AdminStudioClient';
import { CommandConsole, type CommandConfig, type SiteStatus } from './CommandConsole';
import { ImageStudio, type AiTemplate } from './ImageStudio';
import { StudioTabs } from './StudioTabs';

export const dynamic = 'force-dynamic';

const FALLBACK: CommandConfig = { provider: 'mock', model: 'rules', ready: true, anthropicConfigured: false, openaiConfigured: false, geminiConfigured: false, tasks: [], actions: [] };

/** AI 工作站＝後台全站工作總控：指令台（商品製圖工作項目內嵌 API 產圖 inShow 版面）／模板與任務管理；前台不提供工作站。 */
export default async function AdminStudioPage() {
  const act = (action: string, params: Record<string, unknown> = {}) => apiServer<{ data?: Record<string, unknown> }>('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, params }) });
  const [config, templates, adminTemplates, jobs, tpl, msgs, qs, site] = await Promise.all([apiServer<CommandConfig>('/api/admin/ai/command/config'), apiServer<AiTemplate[]>('/api/studio/templates'), apiServer<AdminTemplate[]>('/api/admin/studio/templates'), apiServer<AdminJob[]>('/api/admin/studio/jobs?limit=50'), act('list_site_templates'), act('list_contact_messages', { status: 'new', limit: 1 }), act('list_questions', { status: 'open' }), act('get_site')]);
  const current = (tpl?.data as { current?: { id?: string }; templates?: { id: string; name: string }[] } | undefined);
  const status: SiteStatus = {
    templateId: current?.current?.id || undefined,
    templateName: current?.templates?.find((t) => t.id === current?.current?.id)?.name,
    themeMode: (site?.data as { theme?: { mode?: string } } | undefined)?.theme?.mode,
    unreadMessages: ((msgs?.data as { counts?: Record<string, number> } | undefined)?.counts?.new) ?? 0,
    openQuestions: Array.isArray(qs?.data) ? (qs!.data as unknown[]).length : 0,
  };
  return (
    <Section title="AI 工作站" group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        後台全站工作總控（規劃見 docs/AI工作站操作規劃.md）：五組十二項工作——建站（版型主題／選單）、內容（首頁區塊／頁面文章／銷售頁）、商務（商品庫存／課程學員／訂單物流發票）、營運（報表名單／客服訊息／追蹤 SEO）、設計（製圖與 Banner）。唯讀立即執行、寫入需確認；頁面先草稿再預覽再發佈。
      </p>
      <StudioTabs command={<CommandConsole config={config ?? FALLBACK} status={status} imageStudio={<ImageStudio templates={templates ?? []} />} />} manage={<AdminStudioClient templates={adminTemplates ?? []} jobs={jobs ?? []} />} />
    </Section>
  );
}

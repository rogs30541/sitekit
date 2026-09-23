import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { PluginsClient, type PluginRow } from './PluginsClient';

export const dynamic = 'force-dynamic';

/** 外掛：列出已載入的外掛（sitekit.config.mjs／SITEKIT_PLUGINS）、它們註冊的動作與設定表單。 */
export default async function AdminPluginsPage() {
  const [plugins, settings] = await Promise.all([apiServer<{ plugins: PluginRow[] }>('/api/admin/system/plugins'), apiServer<{ ok: boolean; data?: Record<string, string> }>('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'get_settings' }) })]);
  return (
    <Section title="外掛" group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        外掛是建置期載入的 npm 套件：在站台根目錄的 <code>sitekit.config.mjs</code> 列出，或用環境變數 <code>SITEKIT_PLUGINS</code>（逗號分隔）。外掛可訂閱站台事件、註冊 OPS／MCP 動作、宣告設定欄位（下方表單）。改清單後重新啟動生效。
      </p>
      <PluginsClient plugins={plugins?.plugins ?? []} values={settings?.data ?? {}} />
    </Section>
  );
}

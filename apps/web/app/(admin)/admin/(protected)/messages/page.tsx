import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { MessagesClient, type MessageRow } from './MessagesClient';

export const dynamic = 'force-dynamic';

/** 表單訊息：前台「聯絡我們」區塊（showForm）送出的訊息。 */
export default async function AdminMessagesPage() {
  const data = await apiServer<{ counts: Record<string, number>; items: MessageRow[] }>('/api/admin/messages?limit=500');
  return (
    <Section title="表單訊息" group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        前台任何頁面的「聯絡我們」區塊勾選「顯示聯絡表單」後，訪客送出的訊息會存在這裡，並寄到「儲存與通知」設定的 mail.adminTo。同功能 MCP：<code>sitekit_list_contact_messages</code>。
      </p>
      <MessagesClient rows={data?.items ?? []} counts={data?.counts ?? {}} />
    </Section>
  );
}

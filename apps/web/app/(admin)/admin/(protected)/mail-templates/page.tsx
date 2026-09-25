import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { MailTemplatesClient, type MailTpl } from './MailTemplatesClient';

export const dynamic = 'force-dynamic';

/** 信件範本：11 種通知信（顧客／站主／訪客）的主旨與內文；自動回覆開關；預覽與測試。 */
export default async function AdminMailTemplatesPage() {
  const r = await apiServer<{ data?: MailTpl[] }>('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'list_mail_templates', params: {} }) });
  const list = r?.data ?? [];
  return (
    <Section title="信件範本" group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        寄件人與收件站主信箱在{' '}
        <Link href="/admin/integrations" className="underline">
          儲存與通知
        </Link>
        {' 設定（Email provider＝log 時只記錄不寄出）。範本用 {{變數}} 帶入資料；留空即用預設。同功能 MCP：sitekit_list_mail_templates／sitekit_set_mail_template。'}
      </p>
      {list.length ? <MailTemplatesClient initial={list} /> : <p className="text-sm text-red-700">讀取失敗（請確認已登入且 api 在線）。</p>}
    </Section>
  );
}

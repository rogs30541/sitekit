import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { InvoiceSettingsForm, type InvoiceConfig, type InvoiceRow } from './InvoiceSettingsForm';

export const dynamic = 'force-dynamic';

/** 電子發票：供應商（ezPay／綠界）、開立時機、商店參數；發票列表與作廢。 */
export default async function AdminInvoicePage() {
  const [cfg, rows] = await Promise.all([apiServer<InvoiceConfig>('/api/admin/invoices/config'), apiServer<InvoiceRow[]>('/api/admin/invoices')]);
  return (
    <Section title="電子發票設定">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/admin" className="underline">
          回總覽
        </Link>
        {' · 結帳時買家可選：個人（Email 載具）／手機條碼／自然人憑證／公司統編／捐贈；付款成功自動開立（或改為人工在訂單頁開立），退款自動作廢。也可由 MCP issue_invoice／invalidate_invoice／list_invoices 操作。'}
      </p>
      {cfg ? <InvoiceSettingsForm cfg={cfg} rows={rows ?? []} /> : <p className="text-red-700">讀取失敗</p>}
    </Section>
  );
}

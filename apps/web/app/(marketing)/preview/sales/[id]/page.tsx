import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Section } from '@/components/Section';
import { SalesPageView, type SalesRender } from '@/components/SalesPageView';
import { API_INTERNAL_URL } from '@/lib/api-public';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '沙盒預覽（銷售頁草稿）', robots: { index: false, follow: false } };

/** 銷售頁沙盒預覽：讀草稿（token 2 小時），不影響線上；追蹤碼不注入 */
export default async function SalesPreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const { id } = await params;
  const { token = '' } = await searchParams;
  let page: SalesRender | null = null;
  try {
    const r = await fetch(`${API_INTERNAL_URL}/api/sales/preview/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (r.status === 401)
      return (
        <Section title={t('預覽連結無效或已過期')} group="(marketing)">
          <p>{t('請回後台「一頁式銷售頁」重新產生沙盒預覽連結（每個連結 2 小時有效）。')}</p>
        </Section>
      );
    if (r.ok) page = (await r.json()) as SalesRender;
  } catch {
    page = null;
  }
  if (!page) notFound();
  return (
    <div>
      <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <strong>{t('沙盒預覽')}</strong>：這是銷售頁「草稿」，尚未發佈；線上 {page.version ? `目前為第 ${page.version} 版` : t('尚未上線')}。追蹤碼在預覽不會載入。
      </div>
      <SalesPageView page={page} preview />
    </div>
  );
}

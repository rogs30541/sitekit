import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { HomeSectionsEditor } from './HomeSectionsEditor';
import { SiteSettingsForm, type SiteAdmin } from './SiteSettingsForm';

export const dynamic = 'force-dynamic';

/** 網站設定：品牌／聯絡／社群／SEO（走 AI API 路徑 update_settings）＋首頁版面區塊（PUT /api/admin/site/home）。 */
export default async function AdminSitePage() {
  const data = await apiServer<SiteAdmin>('/api/admin/site');
  return (
    <div className="space-y-4">
      <Section title="網站設定">
        <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
          <Link href="/admin" className="underline">
            回後台首頁
          </Link>
          {' · 選單請到 '}
          <Link href="/admin/menu" className="underline">
            網站架構
          </Link>
          {'；首頁若同時有「首頁版面區塊」與 slug=home 的頁面，以區塊為準。'}
        </p>
        {data ? <SiteSettingsForm fields={data.fields} /> : <p className="text-red-700">讀取失敗</p>}
      </Section>
      <Section title="首頁版面">
        {data ? <HomeSectionsEditor initial={data.sections} /> : null}
      </Section>
    </div>
  );
}

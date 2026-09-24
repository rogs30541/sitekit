import Link from 'next/link';
import { Section } from '@/components/Section';
import { TemplateGallery } from '@/components/TemplateGallery';

export const dynamic = 'force-dynamic';

/** 套版庫：五大分類（形象／電商／課程／品牌／專業服務）× 10 套快速套版；套用＝主題＋首頁區塊＋選單＋子頁，可還原。 */
export default function AdminTemplatesPage() {
  return (
    <div className="space-y-4">
      <Section title="套版庫">
        <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
          <Link href="/admin/site" className="underline">
            網站設定
          </Link>
          {' · 套用後可到「首頁版面」逐區塊微調、到 '}
          <Link href="/admin/menu" className="underline">
            網站架構
          </Link>
          {' 調選單、到 '}
          <Link href="/admin/content" className="underline">
            新增網頁
          </Link>
          {' 編輯子頁。MCP 也可用 sitekit_list_site_templates／sitekit_apply_site_template 操作同一功能。'}
        </p>
        <TemplateGallery />
      </Section>
    </div>
  );
}

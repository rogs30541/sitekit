import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { MenuBuilder, type MenuNode, type PageRow } from './MenuBuilder';

export const dynamic = 'force-dynamic';

/** 網站架構：把頁面拖進樹裡組成前台導覽（兩層）；同功能 MCP：get_menu／set_menu。 */
export default async function AdminMenuPage() {
  const [tree, pages] = await Promise.all([apiServer<MenuNode[]>('/api/admin/menu'), apiServer<PageRow[]>('/api/admin/content')]);
  return (
    <Section title="網站架構與選單">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/admin" className="underline">
          回總覽
        </Link>
        {' · 左側是可用的頁面與系統路徑，拖進右側樹（或按「加入」）；樹內可拖曳排序、拖到項目右側縮排成子選單。儲存後前台導覽立即更新（60 秒內快取）。'}
      </p>
      <MenuBuilder initial={tree ?? []} pages={(pages ?? []).filter((p) => p.status !== 'archived')} />
    </Section>
  );
}

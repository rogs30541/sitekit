import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { MembersClient, type MemberRow } from './MembersClient';

export const dynamic = 'force-dynamic';

/** 會員資料庫：前台會員名單＋電商客戶／課程學員自動標籤（兩者皆有＝兩個標籤）；可刪減名單。同功能 MCP：list_members／delete_member。 */
export default async function AdminMembersPage() {
  const rows = await apiServer<MemberRow[]>('/api/admin/members?limit=500');
  return (
    <Section title="會員資料庫" group="(admin)">
      <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
        標籤依實際交易自動標記：有已付款電商訂單＝<b>電商客戶</b>、有已付款課程訂單或課程權限＝<b>課程學員</b>，兩者皆有會同時顯示兩個標籤。刪除有訂單／點數紀錄的會員會保留訂單並將帳號匿名化停用；無交易紀錄者直接刪除。
      </p>
      <MembersClient rows={rows ?? []} />
    </Section>
  );
}

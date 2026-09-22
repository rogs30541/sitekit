import Link from 'next/link';
import { Section } from '@/components/Section';
import { ADMIN_NAV } from '@/components/AdminNav';

export const dynamic = 'force-dynamic';

/** 後台首頁：五大分類入口（總覽數字與 AI API 路徑已移到「系統功能 → 系統設定」）。 */
export default function AdminHomePage() {
  return (
    <Section title="後台工作站" group="(admin)">
      <p className="mb-4 text-xs" style={{ color: 'var(--muted)' }}>
        從上方選單或下方分類進入功能。日常工作可直接到「AI 工作站」用自然語言下指令（寫入動作需確認）。
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_NAV.map((g) => (
          <div key={g.key} className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
            <h2 className="mb-2 text-sm font-bold">{g.label}</h2>
            <ul className="space-y-1 text-xs">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="font-semibold hover:underline">
                    {i.label}
                  </Link>
                  {i.desc ? <span style={{ color: 'var(--muted)' }}>　{i.desc}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

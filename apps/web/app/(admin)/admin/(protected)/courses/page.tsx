import Link from 'next/link';
import { Section } from '@/components/Section';
import { twd } from '@/lib/api-public';
import { apiServer } from '@/lib/api-server';

interface AdminCourse {
  id: string;
  slug: string;
  isPublished: boolean;
  product: { name: string; price: number; isActive: boolean };
  _count: { chapters: number };
}

export const dynamic = 'force-dynamic';

export default async function AdminCoursesPage() {
  const courses = (await apiServer<AdminCourse[]>('/api/admin/catalog/courses')) ?? [];
  return (
    <Section title="課程管理" group="(admin)">
      <p className="mb-3 text-xs">
        <Link href="/admin" className="underline">
          回後台首頁
        </Link>
      </p>
      <table className="w-full text-left text-xs">
        <thead>
          <tr style={{ color: 'var(--muted)' }}>
            <th className="py-1">課程</th>
            <th className="py-1">slug</th>
            <th className="py-1">價格</th>
            <th className="py-1">章節</th>
            <th className="py-1">狀態</th>
          </tr>
        </thead>
        <tbody>
          {courses.map((c) => (
            <tr key={c.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <td className="py-2">
                <Link href={`/admin/courses/${c.id}`} className="font-semibold underline">
                  {c.product.name}
                </Link>
              </td>
              <td className="py-2 font-mono">{c.slug}</td>
              <td className="py-2">{twd(c.product.price)}</td>
              <td className="py-2">{c._count.chapters}</td>
              <td className="py-2">{c.isPublished ? '已發布' : '草稿'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

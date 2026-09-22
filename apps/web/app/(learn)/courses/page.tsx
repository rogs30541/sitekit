import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiPublic, priceParts, twd, type CourseSummary } from '@/lib/api-public';

export const revalidate = 60;
export const metadata = { title: '課程', description: '線上課程列表' };

export default async function CoursesPage() {
  const courses = (await apiPublic<CourseSummary[]>('/api/catalog/courses')) ?? [];
  return (
    <Section title="線上課程" group="(learn)">
      {courses.length ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {courses.map((c) => (
            <li key={c.id} className="rounded-lg border p-4" style={{ borderColor: 'var(--line)' }}>
              <Link href={`/course/${c.slug}`} className="text-base font-semibold hover:underline">
                {c.product.name}
              </Link>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                {c._count.chapters} 章 · {c.product.price === 0 ? '免費' : priceParts(c.product).onSale ? <><span className="text-red-700">{twd(priceParts(c.product).price)}</span> <s>{twd(c.product.price)}</s></> : twd(c.product.price)}
                {c.instructorName ? ` · 講師 ${c.instructorName}` : ''}
              </p>
              {c.summary ? <p className="mt-2">{c.summary}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: 'var(--muted)' }}>尚無課程。</p>
      )}
    </Section>
  );
}

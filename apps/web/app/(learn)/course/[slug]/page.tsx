import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Section } from '@/components/Section';
import { apiPublic, twd, type CourseDetail } from '@/lib/api-public';
import { apiServer, getMe } from '@/lib/api-server';
import { BuyButton } from './BuyButton';
import { Player } from './Player';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const c = await apiPublic<CourseDetail>(`/api/catalog/courses/${encodeURIComponent(slug)}`);
  return c ? { title: c.product.name, description: c.summary ?? c.product.description ?? undefined } : { title: '找不到課程' };
}

export default async function CoursePage({ params }: Params) {
  const { slug } = await params;
  const me = await getMe();
  const authed = !!me?.authenticated;
  const course = authed ? await apiServer<CourseDetail>(`/api/learn/courses/${encodeURIComponent(slug)}`) : await apiPublic<CourseDetail>(`/api/catalog/courses/${encodeURIComponent(slug)}`, 0);
  if (!course) notFound();
  const entitled = !!course.entitled;
  return (
    <div className="space-y-4">
      <Section title={course.product.name} group="(learn)">
        {course.product.coverUrl ? <img src={course.product.coverUrl} alt="" className="mb-3 max-h-64 w-full rounded-lg object-cover" /> : null}
        <p>{course.summary ?? course.product.description}</p>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-lg font-bold">{course.product.price === 0 ? '免費' : twd(course.product.price)}</span>
          {entitled ? (
            <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-800">已擁有</span>
          ) : authed ? (
            <BuyButton productId={course.product.id} />
          ) : (
            <Link href={`/login?next=/course/${course.slug}`} className="rounded bg-black px-4 py-2 text-sm text-white">
              登入後購買
            </Link>
          )}
        </div>
      </Section>
      <Section title="章節" group="(learn)">
        <ol className="space-y-2">
          {course.chapters.map((ch) => (
            <li key={ch.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
              <div className="flex items-center justify-between">
                <span>
                  {ch.order}. {ch.title}
                  {ch.isPreview ? <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs">試看</span> : null}
                </span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {ch.durationSec ? `${Math.round(ch.durationSec / 60)} 分` : ''}
                </span>
              </div>
              {authed && (entitled || ch.isPreview) ? <Player chapterId={ch.id} /> : null}
            </li>
          ))}
        </ol>
        {!authed ? (
          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            登入後可播放試看章節。
          </p>
        ) : null}
      </Section>
    </div>
  );
}

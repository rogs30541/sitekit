import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Section } from '@/components/Section';
import { apiPublic, buildTree, fmtDuration, twd, type CourseDetail, fmtDate } from '@/lib/api-public';
import { apiServer, getMe } from '@/lib/api-server';
import { BuyButton } from './BuyButton';
import { YouTubePlayer } from './YouTubePlayer';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const c = await apiPublic<CourseDetail>(`/api/catalog/courses/${encodeURIComponent(slug)}`);
  return c ? { title: c.product.name, description: c.summary ?? c.product.description ?? undefined } : { title: '找不到課程' };
}

const ACCESS_LABEL = (c: CourseDetail) => (c.accessMode === 'days' && c.accessDays ? `購買後 ${c.accessDays} 天內觀看` : c.accessMode === 'until' && c.accessUntil ? `觀看至 ${fmtDate(c.accessUntil)}` : '無限期觀看');

/** 銷售頁：封面影片與試看影片是公開素材；正式章節影片只在教室頁、授權後播放。 */
export default async function CoursePage({ params }: Params) {
  const { slug } = await params;
  const me = await getMe();
  const authed = !!me?.authenticated;
  const course = authed ? await apiServer<CourseDetail>(`/api/learn/courses/${encodeURIComponent(slug)}`) : await apiPublic<CourseDetail>(`/api/catalog/courses/${encodeURIComponent(slug)}`, 0);
  if (!course) notFound();
  const entitled = !!course.entitled;
  const tree = buildTree(course.chapters);
  const totalSec = course.chapters.reduce((s, c) => s + (c.durationSec ?? 0), 0);
  const heroVideo = course.coverVideo ?? course.previewVideo;
  return (
    <div className="space-y-4">
      <Section title={course.product.name} group="(learn)">
        {heroVideo?.provider === 'youtube' ? (
          <div className="mb-3">
            <YouTubePlayer videoId={heroVideo.id} poster={course.product.coverUrl} title={course.coverVideo ? '課程介紹' : '試看'} />
          </div>
        ) : course.product.coverUrl ? (
          <img src={course.product.coverUrl} alt="" className="mb-3 max-h-64 w-full rounded-lg object-cover" />
        ) : null}
        <p>{course.summary ?? course.product.description}</p>
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          {course.chapters.length} 個章節{totalSec ? `，共 ${fmtDuration(totalSec)}` : ''} · {ACCESS_LABEL(course)}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <span className="text-lg font-bold">{course.product.price === 0 ? '免費' : twd(course.product.price)}</span>
          {entitled ? (
            <>
              <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-800">已擁有{course.expiresAt ? `（至 ${fmtDate(course.expiresAt)}）` : ''}</span>
              <Link href={`/classroom/${course.slug}`} className="rounded bg-black px-4 py-2 text-sm text-white">
                進入教室
              </Link>
            </>
          ) : authed ? (
            <BuyButton productId={course.product.id} />
          ) : (
            <Link href={`/login?next=/course/${course.slug}`} className="rounded bg-black px-4 py-2 text-sm text-white">
              登入後購買
            </Link>
          )}
        </div>
      </Section>
      {course.previewVideo && course.coverVideo && !entitled && course.previewVideo.provider === 'youtube' ? (
        <Section title="試看" group="(learn)">
          <YouTubePlayer videoId={course.previewVideo.id} poster={course.product.coverUrl} title="試看" />
        </Section>
      ) : null}
      <Section title="課程章節" group="(learn)">
        <ol className="space-y-2">
          {tree.map((root) => (
            <li key={root.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {root.title}
                  {root.isPreview ? <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-normal">試看</span> : null}
                </span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {fmtDuration(root.durationSec)}
                </span>
              </div>
              {root.children.length ? (
                <ul className="mt-2 space-y-1 border-l pl-3" style={{ borderColor: 'var(--line)' }}>
                  {root.children.map((ch) => (
                    <li key={ch.id} className="flex items-center justify-between text-sm">
                      <span>
                        {ch.title}
                        {ch.isPreview ? <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 text-xs">試看</span> : null}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>
                        {fmtDuration(ch.durationSec)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {authed && (entitled || root.isPreview) && root.hasVideo ? (
                <Link href={`/classroom/${course.slug}/${root.id}`} className="mt-2 inline-block text-xs underline">
                  {root.isPreview && !entitled ? '免費試看' : '前往觀看'}
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
        {!authed ? (
          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            登入後可觀看試看章節。
          </p>
        ) : null}
      </Section>
    </div>
  );
}

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { buildTree, flattenPlayable, fmtDuration, type CourseDetail, fmtDate } from '@/lib/api-public';
import { apiServer, getMe } from '@/lib/api-server';
import { ChapterStage } from './ChapterStage';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

/** 教室頁：左側章節樹＋完成狀態，右側自製播放器、進度、標記完成、上一個／下一個。 */
export default async function ClassroomChapterPage({ params }: { params: Promise<{ slug: string; chapterId: string }> }) {
  const { slug, chapterId } = await params;
  const me = await getMe();
  if (!me?.authenticated) redirect(`/login?next=/classroom/${slug}/${chapterId}`);
  const course = await apiServer<CourseDetail>(`/api/learn/courses/${encodeURIComponent(slug)}`);
  if (!course) notFound();
  const current = course.chapters.find((c) => c.id === chapterId);
  if (!current) notFound();
  const entitled = !!course.entitled;
  const canWatch = entitled || current.isPreview;
  const tree = buildTree(course.chapters);
  const playable = flattenPlayable(course.chapters);
  const idx = playable.findIndex((c) => c.id === chapterId);
  const prev = idx > 0 ? playable[idx - 1] : null;
  const next = idx >= 0 && idx < playable.length - 1 ? playable[idx + 1] : null;
  const progress = course.progress ?? {};
  const sp = course.summaryProgress ?? { total: 0, done: 0, percent: 0 };
  const totalSec = course.chapters.reduce((s, c) => s + (c.durationSec ?? 0), 0);

  const Row = ({ id, title, durationSec, isPreview, depth }: { id: string; title: string; durationSec: number | null; isPreview: boolean; depth: number }) => {
    const done = progress[id]?.completed;
    const active = id === chapterId;
    const locked = !entitled && !isPreview;
    return (
      <li>
        <Link href={`/classroom/${slug}/${id}`} className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${active ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'}`} style={{ paddingLeft: `${8 + depth * 16}px` }}>
          <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${done ? 'border-green-600 bg-green-600 text-white' : active ? 'border-white' : ''}`} style={{ borderColor: done ? undefined : active ? undefined : 'var(--line)' }}>
            {done ? '✓' : locked ? '🔒' : ''}
          </span>
          <span className="flex-1 truncate">{title}</span>
          <span className={`text-xs ${active ? 'text-neutral-300' : ''}`} style={{ color: active ? undefined : 'var(--muted)' }}>
            {fmtDuration(durationSec)}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <aside className="rounded-xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
        <Link href={`/course/${slug}`} className="text-sm font-bold hover:underline">
          {course.product.name}
        </Link>
        <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
          {course.chapters.length} 個章節{totalSec ? `，${fmtDuration(totalSec)}` : ''} · 完成 {sp.done}/{sp.total}（{sp.percent}%）
        </p>
        <div className="mt-2 h-1.5 w-full rounded bg-neutral-200">
          <div className="h-1.5 rounded bg-green-600" style={{ width: `${sp.percent}%` }} />
        </div>
        {course.expiresAt ? (
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            觀看期限至 {fmtDate(course.expiresAt)}
          </p>
        ) : null}
        <ul className="mt-3 space-y-0.5">
          {tree.map((root) => (
            <li key={root.id}>
              <ul className="space-y-0.5">
                <Row id={root.id} title={root.title} durationSec={root.durationSec} isPreview={root.isPreview} depth={0} />
                {root.children.map((ch) => (
                  <Row key={ch.id} id={ch.id} title={ch.title} durationSec={ch.durationSec} isPreview={ch.isPreview} depth={1} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </aside>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold">
            {current.title}
            {progress[chapterId]?.completed ? <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs font-normal text-green-800">已完成</span> : <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-xs font-normal">未完成</span>}
          </h1>
          <div className="flex gap-2 text-xs">
            {prev ? (
              <Link href={`/classroom/${slug}/${prev.id}`} className="rounded border px-3 py-1" style={{ borderColor: 'var(--line)' }}>
                上一個
              </Link>
            ) : null}
            {next ? (
              <Link href={`/classroom/${slug}/${next.id}`} className="rounded bg-black px-3 py-1 text-white">
                下一個
              </Link>
            ) : (
              <span className="rounded border px-3 py-1" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
                沒有更多章節
              </span>
            )}
          </div>
        </div>
        {canWatch ? (
          <ChapterStage chapterId={chapterId} hasVideo={current.hasVideo !== false} initialCompleted={!!progress[chapterId]?.completed} startAt={progress[chapterId]?.positionSec ?? 0} nextHref={next ? `/classroom/${slug}/${next.id}` : null} />
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg bg-neutral-900 text-white">
            <p>這一章需要購買後才能觀看</p>
            <Link href={`/course/${slug}`} className="rounded bg-white px-4 py-2 text-sm text-black">
              前往購買
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

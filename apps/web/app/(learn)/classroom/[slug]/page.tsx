import { redirect } from 'next/navigation';
import { flattenPlayable, type CourseDetail } from '@/lib/api-public';
import { apiServer, getMe } from '@/lib/api-server';

export const dynamic = 'force-dynamic';

/** 教室入口：導到第一個未完成（或第一個）可播放章節。 */
export default async function ClassroomIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await getMe();
  if (!me?.authenticated) redirect(`/login?next=/classroom/${slug}`);
  const course = await apiServer<CourseDetail>(`/api/learn/courses/${encodeURIComponent(slug)}`);
  if (!course) redirect('/courses');
  const playable = flattenPlayable(course.chapters).filter((c) => c.hasVideo !== false);
  const first = playable.find((c) => !course.progress?.[c.id]?.completed) ?? playable[0] ?? course.chapters[0];
  if (!first) redirect(`/course/${slug}`);
  redirect(`/classroom/${slug}/${first.id}`);
}

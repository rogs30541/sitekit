import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { ChapterTree, type AdminChapter } from './ChapterTree';
import { CourseSettingsForm, type AdminCourse } from './CourseSettingsForm';
import { VideoLibrary, type VideoAsset } from './VideoLibrary';
import { CourseCommunityAdmin } from './CourseCommunityAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminCourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [course, videos] = await Promise.all([apiServer<AdminCourse & { chapters: AdminChapter[] }>(`/api/admin/catalog/courses/${id}`), apiServer<VideoAsset[]>('/api/admin/videos?provider=youtube')]);
  if (!course) notFound();
  return (
    <div className="space-y-4">
      <Section title={`課程設定：${course.product.name}`} group="(admin)">
        <p className="mb-3 text-xs">
          <Link href="/admin/courses" className="underline">
            回課程列表
          </Link>
          {' · '}
          <Link href={`/course/${course.slug}`} className="underline" target="_blank">
            銷售頁
          </Link>
          {' · '}
          <Link href={`/classroom/${course.slug}`} className="underline" target="_blank">
            教室
          </Link>
        </p>
        <CourseSettingsForm course={course} />
      </Section>
      <Section title="章節" group="(admin)">
        <ChapterTree courseId={course.id} chapters={course.chapters} videos={videos ?? []} />
      </Section>
      <Section title="問答與公告" group="(admin)">
        <CourseCommunityAdmin courseId={course.id} />
      </Section>
      <Section title="YouTube 影片庫" group="(admin)">
        <VideoLibrary videos={videos ?? []} />
      </Section>
    </div>
  );
}

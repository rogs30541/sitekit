import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { ChapterEditor, type AdminChapter } from './ChapterEditor';
import { VideoLibrary, type VideoAsset } from './VideoLibrary';

interface AdminCourseDetail {
  id: string;
  slug: string;
  isPublished: boolean;
  product: { name: string };
  chapters: AdminChapter[];
}

export const dynamic = 'force-dynamic';

export default async function AdminCourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [course, videos] = await Promise.all([apiServer<AdminCourseDetail>(`/api/admin/catalog/courses/${id}`), apiServer<VideoAsset[]>('/api/admin/videos?provider=youtube')]);
  if (!course) notFound();
  return (
    <div className="space-y-4">
      <Section title={`章節與影片：${course.product.name}`} group="(admin)">
        <p className="mb-3 text-xs">
          <Link href="/admin/courses" className="underline">
            回課程列表
          </Link>
          {' · '}
          <Link href={`/course/${course.slug}`} className="underline" target="_blank">
            前台預覽
          </Link>
        </p>
        <ChapterEditor courseId={course.id} chapters={course.chapters} videos={videos ?? []} />
      </Section>
      <Section title="YouTube 影片庫" group="(admin)">
        <VideoLibrary videos={videos ?? []} />
      </Section>
    </div>
  );
}

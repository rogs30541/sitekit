import { ReportsView } from '../reports/ReportsView';

export const dynamic = 'force-dynamic';

/** 課程報表（與電商報表各自獨立） */
export default async function AdminCourseReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; groupBy?: string }> }) {
  return <ReportsView scope="course" sp={await searchParams} />;
}

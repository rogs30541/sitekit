import { ReportsView } from './ReportsView';

export const dynamic = 'force-dynamic';

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; groupBy?: string }> }) {
  return <ReportsView scope="shop" sp={await searchParams} />;
}

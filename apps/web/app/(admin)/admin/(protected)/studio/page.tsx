import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiServer } from '@/lib/api-server';
import { AdminStudioClient, type AdminTemplate, type AdminJob } from './AdminStudioClient';

export const dynamic = 'force-dynamic';

export default async function AdminStudioPage() {
  const [templates, jobs] = await Promise.all([apiServer<AdminTemplate[]>('/api/admin/studio/templates'), apiServer<AdminJob[]>('/api/admin/studio/jobs?limit=50')]);
  return (
    <div className="space-y-4">
      <Section title="AI 工作站管理" group="(admin)">
        <p className="mb-3 text-xs">
          <Link href="/admin" className="underline">
            回總覽
          </Link>
          {' · '}
          <Link href="/studio" className="underline" target="_blank">
            前台工作站
          </Link>
        </p>
        <AdminStudioClient templates={templates ?? []} jobs={jobs ?? []} />
      </Section>
    </div>
  );
}

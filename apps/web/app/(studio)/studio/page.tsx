import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiPublic } from '@/lib/api-public';
import { apiServer, getMe } from '@/lib/api-server';
import { StudioClient, type AiTemplate, type CreditBalance } from './StudioClient';

export const metadata = { title: 'AI 創作工作站', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function StudioPage() {
  const me = await getMe();
  const templates = (await apiPublic<AiTemplate[]>('/api/studio/templates', 0)) ?? [];
  if (!me?.authenticated || !me.user) {
    return (
      <Section title="AI 創作工作站" group="(studio)">
        <p>
          請先{' '}
          <Link href="/login?next=/studio" className="underline">
            登入
          </Link>
          。目前有 {templates.length} 個模板可用。
        </p>
      </Section>
    );
  }
  const [credits, keys] = await Promise.all([apiServer<CreditBalance>('/api/credits/me'), apiServer<{ provider: string; last4: string; enabled: boolean }[]>('/api/me/keys')]);
  return (
    <Section title="AI 創作工作站" group="(studio)">
      <StudioClient templates={templates} credits={credits ?? { stored: 0, reserved: 0, available: 0 }} byok={!!keys?.find((k) => k.provider === 'openai' && k.enabled)} />
    </Section>
  );
}

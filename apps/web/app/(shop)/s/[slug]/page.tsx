import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Section } from '@/components/Section';
import { SalesPageView, type SalesRender } from '@/components/SalesPageView';
import { API_INTERNAL_URL } from '@/lib/api-public';
import { apiFetch } from '@/lib/api-fetch';
import { PasswordGate } from './PasswordGate';
import { getSite } from '@/lib/site';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

type Resp = SalesRender | { id: string; slug: string; title: string; state: 'closed' | 'scheduled' | 'locked'; closedMessage?: string; openAt?: string | null; seo: { title: string; description: string; ogImage: string } };

async function load(slug: string, pw?: string): Promise<Resp | null> {
  try {
    const r = await apiFetch(`${API_INTERNAL_URL}/api/sales/${encodeURIComponent(slug)}${pw ? `?pw=${encodeURIComponent(pw)}` : ''}`, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as Resp) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await load(slug);
  if (!p) return { title: t('找不到銷售頁') };
  const seo = 'doc' in p ? p.doc.seo : p.seo;
  return { title: seo.title || p.title, description: seo.description || undefined, ...(seo.ogImage ? { openGraph: { images: [seo.ogImage] } } : {}), ...('doc' in p && p.doc.seo.favicon ? { icons: { icon: p.doc.seo.favicon } } : {}) };
}

/** 一頁式銷售頁前台 /s/<slug>：線上快照；排程／關閉／密碼由 API 判定 */
export default async function SalesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ pw?: string }> }) {
  const { slug } = await params;
  const { pw } = await searchParams;
  const p = await load(slug, pw);
  if (!p) notFound();
  if (p.state === 'closed' || p.state === 'scheduled')
    return (
      <Section title={p.title} group="(shop)">
        <p>{p.state === 'scheduled' ? `本銷售頁將於 ${p.openAt ? new Date(p.openAt).toLocaleString('zh-TW') : t('稍後')} 開啟。` : p.closedMessage}</p>
      </Section>
    );
  if (p.state === 'locked') return <PasswordGate title={p.title} wrong={!!pw} />;
  const site = await getSite();
  return <SalesPageView page={p as SalesRender} siteTracking={site.tracking} />;
}

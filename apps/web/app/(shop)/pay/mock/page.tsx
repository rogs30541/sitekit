import { Section } from '@/components/Section';
import { MockGateway } from './MockGateway';
import { t } from '@/lib/i18n';

export const metadata = { title: '測試付款閘道', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function MockPayPage({ searchParams }: { searchParams: Promise<{ order?: string; sig?: string }> }) {
  const { order = '', sig = '' } = await searchParams;
  return (
    <Section title={t('測試付款閘道（mock）')} group="(shop)">
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        {t('僅限非 production 環境。這一頁模擬第三方金流：按下按鈕會以伺服器對伺服器方式回呼 api，授權由回呼寫入，不是由這頁寫入。')}
      </p>
      <p className="mt-2 font-mono text-sm">訂單 {order}</p>
      <MockGateway order={order} sig={sig} />
    </Section>
  );
}

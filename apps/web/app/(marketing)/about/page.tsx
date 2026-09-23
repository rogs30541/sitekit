import { Section } from '@/components/Section';
import { t } from '@/lib/i18n';

export const metadata = { title: '關於我們' };

export default function AboutPage() {
  return (
    <Section title={t('關於我們')} group="(marketing)">
      <p>{t('每頁獨立 title 與描述，沿用 airuru.cc 的逐路由預渲染做法。')}</p>
    </Section>
  );
}

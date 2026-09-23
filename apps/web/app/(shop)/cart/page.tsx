import { Suspense } from 'react';
import { Section } from '@/components/Section';
import { CartClient } from './CartClient';
import { t } from '@/lib/i18n';

export const metadata = { title: '購物車', robots: { index: false } };

export default function CartPage() {
  return (
    <Section title={t('購物車')} group="(shop)">
      <Suspense>
        <CartClient />
      </Suspense>
    </Section>
  );
}

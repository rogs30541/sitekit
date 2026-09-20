import { Suspense } from 'react';
import { Section } from '@/components/Section';
import { OrderStatus } from './OrderStatus';

export const metadata = { title: '訂單結果', robots: { index: false } };

export default function OrderResultPage() {
  return (
    <Section title="訂單結果" group="(shop)">
      <Suspense>
        <OrderStatus />
      </Suspense>
    </Section>
  );
}

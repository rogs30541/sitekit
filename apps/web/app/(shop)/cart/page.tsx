import { Section } from '@/components/Section';
import { CartClient } from './CartClient';

export const metadata = { title: '購物車', robots: { index: false } };

export default function CartPage() {
  return (
    <Section title="購物車" group="(shop)">
      <CartClient />
    </Section>
  );
}

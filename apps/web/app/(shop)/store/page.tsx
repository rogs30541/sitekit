import { Section } from '@/components/Section';

export const metadata = { title: '商城' };

export default function StorePage() {
  return (
    <Section title="電商商城" group="(shop)">
      <p>商品與課程共用 products 資料表（type：physical / course / credit_pack）。購物車與結帳走 api。</p>
    </Section>
  );
}

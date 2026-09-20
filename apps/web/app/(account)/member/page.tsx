import { Section } from '@/components/Section';

export const metadata = { title: '會員中心' };

export default function MemberPage() {
  return (
    <Section title="會員中心" group="(account)">
      <p>訂單、授權、點數帳本與訂閱總覽。多管道登入可合併為單一帳號。</p>
    </Section>
  );
}

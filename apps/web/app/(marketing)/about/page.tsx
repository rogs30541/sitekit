import { Section } from '@/components/Section';

export const metadata = { title: '關於我們' };

export default function AboutPage() {
  return (
    <Section title="關於我們" group="(marketing)">
      <p>每頁獨立 title 與描述，沿用 airuru.cc 的逐路由預渲染做法。</p>
    </Section>
  );
}

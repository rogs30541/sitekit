import { Section } from '@/components/Section';

export const metadata = { title: '工作站' };

export default function StudioPage() {
  return (
    <Section title="AI 創作工作站" group="(studio)">
      <p>純 CSR 工作站。生成任務進佇列，點數保留再結算，失敗退點。</p>
    </Section>
  );
}

import { Section } from '@/components/Section';

export const metadata = { title: '課程' };

export default function CoursesPage() {
  return (
    <Section title="線上課程" group="(learn)">
      <p>購買後授權寫入 entitlements，影片播放網址由 api 即時簽發、帶時效。</p>
    </Section>
  );
}

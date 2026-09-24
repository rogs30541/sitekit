import { SectionRenderer } from './SectionRenderer';
import type { HomeSection } from '@/lib/site';

/** 首頁區塊（後台「網站設定 → 首頁版面」／套版）：委派給共用 SectionRenderer（20 種 kind）。 */
export function HomeSections({ sections }: { sections: HomeSection[] }) {
  return <SectionRenderer sections={sections} />;
}

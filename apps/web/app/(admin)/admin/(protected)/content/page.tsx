import { ContentList } from './ContentList';

export const dynamic = 'force-dynamic';

/** 頁面設計（官網頁面，type=page） */
export default function AdminContentPage() {
  return <ContentList type="page" />;
}

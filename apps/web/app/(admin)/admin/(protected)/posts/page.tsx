import { ContentList } from '../content/ContentList';

export const dynamic = 'force-dynamic';

/** 文章（部落格）：與頁面設計分離的獨立列表 */
export default function AdminPostsPage() {
  return <ContentList type="post" />;
}

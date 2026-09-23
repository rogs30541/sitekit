import { Suspense } from 'react';
import { SetupWizard } from './SetupWizard';

export const metadata = { title: '安裝精靈', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** 首次啟動精靈：建立第一位超級管理員 → 站名與網址 → 儲存 → Email → 金流 → 完成（顯示 MCP 用的 OPS token）。 */
export default function SetupPage() {
  return (
    <div className="mx-auto my-8 max-w-2xl">
      <Suspense>
        <SetupWizard />
      </Suspense>
    </div>
  );
}

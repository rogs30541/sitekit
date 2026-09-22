'use client';

import { usePathname } from 'next/navigation';

/** 主內容框：前台置中限寬；後台（/admin）縮小邊界、全寬放大內容區。 */
export function MainFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const admin = pathname.startsWith('/admin');
  return <main className={admin ? 'sk-admin mx-auto w-full max-w-[1800px] px-3 py-3 text-[15px]' : 'mx-auto max-w-5xl px-4 py-8'}>{children}</main>;
}

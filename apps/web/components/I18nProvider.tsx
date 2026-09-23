'use client';

import { setLocale } from '@sitekit/shared';

/** 在渲染期同步設定語言（SSR 與 hydration 都會執行），讓所有 client component 的 t() 一致 */
export function I18nProvider({ locale, children }: { locale: string; children: React.ReactNode }) {
  setLocale(locale);
  return <>{children}</>;
}

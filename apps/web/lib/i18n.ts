/**
 * 前台 i18n：`t('原文')`（原文＝繁中 key）。站台語言為全站單一設定（site.locale）：
 * - 伺服器：root layout 每個請求先 setLocale（在 children 渲染前）
 * - 瀏覽器：<I18nProvider locale> 在渲染時 setLocale，之後 client component 的 t() 就是對的語言
 */
export { t, setLocale, getLocale, htmlLang, normalizeLocale, LOCALES, DICTS, type Locale } from '@sitekit/shared';

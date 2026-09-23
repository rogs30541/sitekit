/**
 * i18n（1.3）：gettext 風格——原文（繁中）就是 key，字典把原文對到目標語言；沒翻的 key 回原文。
 * - 站台語言是「全站單一」設定（site.locale），不是每位訪客各自；所以用模組層狀態就夠：
 *   伺服器每個請求在 root layout 先 setLocale()，瀏覽器端由 I18nProvider 在渲染時 setLocale()
 * - t('文字', { name: 'x' })：{name} 內插
 * - 後台目前維持繁中；前台（訪客看得到的頁面與元件）已抽離。新增前台字串請用 t('原文')，並在 i18n/en.ts 補翻譯
 */
import { en } from './i18n/en';

export const LOCALES = [
  { code: 'zh-TW', label: '繁體中文', htmlLang: 'zh-Hant' },
  { code: 'en', label: 'English', htmlLang: 'en' },
] as const;
export type Locale = (typeof LOCALES)[number]['code'];
export type Dict = Record<string, string>;
export const DICTS: Record<Locale, Dict> = { 'zh-TW': {}, en };

const state: { locale: Locale; dict: Dict } = { locale: 'zh-TW', dict: {} };

export const normalizeLocale = (v: unknown): Locale => (LOCALES.some((l) => l.code === v) ? (v as Locale) : 'zh-TW');
export function setLocale(locale: unknown, dict?: Dict) {
  const l = normalizeLocale(locale);
  state.locale = l;
  state.dict = dict ?? DICTS[l] ?? {};
}
export const getLocale = () => state.locale;
export const htmlLang = (locale: unknown = state.locale) => LOCALES.find((l) => l.code === normalizeLocale(locale))?.htmlLang ?? 'zh-Hant';

export function t(text: string, params?: Record<string, string | number>): string {
  let s = state.dict[text] ?? text;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

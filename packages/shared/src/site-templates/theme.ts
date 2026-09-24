/**
 * 主題參數：存 settings `theme.*`，前台 root layout 轉成 CSS 變數／data-* 屬性；套版時一併寫入。
 */
import { z } from 'zod';

export const themeSchema = z.object({
  mode: z.enum(['light', 'dark']).default('light'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#171717'),
  accent2: z.string().regex(/^#[0-9a-fA-F]{6}$/).or(z.literal('')).optional().default(''),
  font: z.enum(['sans', 'serif', 'display', 'rounded', 'mono']).default('sans'),
  radius: z.enum(['none', 'sm', 'md', 'xl', 'full']).default('md'),
  header: z.enum(['solid', 'transparent', 'centered', 'minimal', 'bar']).default('solid'),
  footer: z.enum(['simple', 'columns', 'minimal']).default('simple'),
  container: z.enum(['narrow', 'normal', 'wide']).default('normal'),
  heading: z.enum(['normal', 'bold', 'display']).default('normal'),
});
export type Theme = z.infer<typeof themeSchema>;
export const DEFAULT_THEME: Theme = themeSchema.parse({});

export const THEME_KEYS = {
  mode: 'theme.mode', accent: 'theme.accent', accent2: 'theme.accent2', font: 'theme.font', radius: 'theme.radius', header: 'theme.header', footer: 'theme.footer', container: 'theme.container', heading: 'theme.heading',
} as const;

/** settings map → Theme（缺值用預設；brand.primaryColor 作 accent 備援） */
export function themeFromSettings(get: (key: string) => string | undefined): Theme {
  const raw: Record<string, string | undefined> = {};
  for (const [k, key] of Object.entries(THEME_KEYS)) raw[k] = get(key) || undefined;
  if (!raw.accent) raw.accent = get('brand.primaryColor') || undefined;
  const r = themeSchema.safeParse(Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)));
  return r.success ? r.data : DEFAULT_THEME;
}

/** Theme → settings 鍵值（套版寫入用） */
export function themeToSettings(t: Partial<Theme>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, key] of Object.entries(THEME_KEYS)) {
    const v = (t as Record<string, string | undefined>)[k];
    if (v !== undefined) out[key] = String(v);
  }
  return out;
}

/** 字型堆疊（不載外部字型，跨平台安全） */
export const FONT_STACKS: Record<Theme['font'], string> = {
  sans: '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif',
  serif: '"Noto Serif TC", "Songti TC", "PMingLiU", Georgia, serif',
  display: '"Noto Sans TC", "Space Grotesk", "Helvetica Neue", Arial, sans-serif',
  rounded: '"Noto Sans TC", "Hiragino Maru Gothic ProN", "Varela Round", system-ui, sans-serif',
  mono: '"JetBrains Mono", "Noto Sans Mono CJK TC", Consolas, monospace',
};
export const RADIUS_PX: Record<Theme['radius'], string> = { none: '0px', sm: '6px', md: '12px', xl: '20px', full: '999px' };

/** accent 上的文字色：依相對亮度選黑／白（WCAG 對比） */
export function onAccent(hex: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#ffffff';
  const lin = (c: string) => { const v = parseInt(c, 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  return L > 0.45 ? '#111111' : '#ffffff';
}

/** 主題色相關 CSS 變數（light／dark 兩套底色＋accent） */
export function themeCssVars(t: Theme): Record<string, string> {
  const dark = t.mode === 'dark';
  return {
    '--accent': t.accent,
    '--accent-2': t.accent2 || t.accent,
    '--on-accent': onAccent(t.accent),
    '--bg': dark ? '#0b0b0d' : '#fafafa',
    '--fg': dark ? '#f2f2f3' : '#171717',
    '--muted': dark ? '#a1a1aa' : '#6b7280',
    '--card': dark ? '#151518' : '#ffffff',
    '--line': dark ? '#26262b' : '#e5e7eb',
    '--soft': dark ? '#1d1d21' : '#f3f4f6',
    '--font': FONT_STACKS[t.font],
    '--radius': RADIUS_PX[t.radius],
    '--container': t.container === 'narrow' ? '56rem' : t.container === 'wide' ? '88rem' : '72rem',
    '--heading-weight': t.heading === 'display' ? '800' : t.heading === 'bold' ? '700' : '600',
  };
}

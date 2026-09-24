import { ICONS, resolveIcon } from '@sitekit/shared';

/** 線條圖示（packages/shared/site-templates/icons.ts 的 SVG 內容；stroke=currentColor） */
export function Icon({ name, size = 24, strokeWidth = 1.75, className, style }: { name: string; size?: number; strokeWidth?: number; className?: string; style?: React.CSSProperties }) {
  const body = ICONS[name];
  if (!body) return null;
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden dangerouslySetInnerHTML={{ __html: body }} />;
}

/**
 * 區塊資料的 icon 欄位：名稱／舊 emoji（自動對映）→ 線條圖示；網址→圖片；對不到的文字原樣顯示；空值→ fallback 圖示。
 */
export function SectionIcon({ icon, fallback, size = 24, className, style }: { icon?: string; fallback?: string; size?: number; className?: string; style?: React.CSSProperties }) {
  const name = resolveIcon(icon) ?? (icon ? null : fallback ?? null);
  if (name) return <Icon name={name} size={size} className={className} style={style} />;
  if (!icon) return null;
  if (/^(https?:)?\//.test(icon)) return <img src={icon} alt="" width={size} height={size} className={className} style={{ ...style, objectFit: 'contain' }} />;
  return (
    <span className={className} style={{ ...style, fontSize: size * 0.8, lineHeight: 1 }}>
      {icon}
    </span>
  );
}

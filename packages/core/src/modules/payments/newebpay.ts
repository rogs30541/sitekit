import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';

/** 藍新 MPG 加解密 helper（移植自度哥 utils/newebpay.ts，行為不變）；表單／回呼邏輯在 gateways/newebpay.ts。 */
export function aesEncrypt(data: string, hashKey: string, hashIv: string): string {
  const cipher = createCipheriv('aes-256-cbc', hashKey, hashIv);
  return cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
}

export function aesDecrypt(encrypted: string, hashKey: string, hashIv: string): string {
  try {
    const d = createDecipheriv('aes-256-cbc', hashKey, hashIv);
    return d.update(encrypted, 'hex', 'utf8') + d.final('utf8');
  } catch {
    // 藍新 v2.3 回傳的 padding 需手動處理
    const d = createDecipheriv('aes-256-cbc', hashKey, hashIv);
    d.setAutoPadding(false);
    let out = d.update(encrypted, 'hex', 'utf8') + d.final('utf8');
    const padLen = out.charCodeAt(out.length - 1);
    if (padLen > 0 && padLen <= 32) out = out.slice(0, out.length - padLen);
    return out;
  }
}

export const sha256Upper = (s: string) => createHash('sha256').update(s).digest('hex').toUpperCase();

export const toQuery = (p: Record<string, string | number>) =>
  Object.entries(p)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

/**
 * 可攜的密碼雜湊（Node 與 Cloudflare Workers 共用）：
 * - 新雜湊一律 PBKDF2-SHA256（WebCrypto，兩邊都是原生實作）：`pbkdf2$sha256$<iterations>$<salt b64>$<hash b64>`
 * - 舊資料的 bcrypt（`$2a$/$2b$`）仍可驗證：Node 用 bcryptjs 非同步；workerd 上 bcryptjs 的非同步分段（nextTick）會讓請求被判「永遠不回應」而中止，改用同步版
 *   （Workers 免費方案 CPU 10ms 可能不夠跑 bcrypt cost 10；從 Node 匯入的舊帳號在 Workers 登入失敗時請用「忘記密碼」重設，會換成 PBKDF2）
 * - 反覆次數 PBKDF2_ITERATIONS 可調（預設 100000；Workers 免費方案建議 30000）
 */
import bcrypt from 'bcryptjs';

const isWorkerd = typeof navigator !== 'undefined' && /Cloudflare-Workers/.test((navigator as { userAgent?: string }).userAgent ?? '');
const subtle = (): SubtleCrypto => (globalThis.crypto as Crypto).subtle;
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function pbkdf2Iterations(): number {
  const n = Number(typeof process !== 'undefined' ? process.env?.PBKDF2_ITERATIONS : '');
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 100_000;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = (globalThis.crypto as Crypto).getRandomValues(new Uint8Array(16));
  const iterations = pbkdf2Iterations();
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$sha256$${iterations}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith('pbkdf2$')) {
    const [, algo, iter, salt, hash] = stored.split('$');
    if (algo !== 'sha256') return false;
    const got = await pbkdf2(password, unb64(salt), Number(iter));
    const want = unb64(hash);
    if (got.length !== want.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
    return diff === 0;
  }
  if (stored.startsWith('$2')) return isWorkerd ? bcrypt.compareSync(password, stored) : bcrypt.compare(password, stored);
  return false;
}

/** 是否為舊格式（bcrypt）：登入成功後可順手升級成 PBKDF2 */
export const isLegacyHash = (stored: string | null | undefined) => !!stored && stored.startsWith('$2');

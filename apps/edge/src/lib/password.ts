/**
 * Workers 沒有 bcrypt 原生模組，純 JS bcrypt 會吃掉 CPU 時間限制（免費方案 10ms）。
 * 改用 Web Crypto 的 PBKDF2-SHA256（原生、快）。格式：pbkdf2$<iter>$<saltB64>$<hashB64>
 */
const ITER = 100_000;

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITER);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [algo, iter, saltB64, hashB64] = stored.split('$');
  if (algo !== 'pbkdf2') return false;
  const hash = new Uint8Array(await derive(password, unb64(saltB64), Number(iter)));
  const expect = unb64(hashB64);
  if (hash.length !== expect.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ expect[i];
  return diff === 0;
}

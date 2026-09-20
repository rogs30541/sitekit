import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Role } from '@sitekit/shared';
import { env } from '../config/env';

export const SESSION_COOKIE = 'sk_session';
export interface SessionPayload { userId: string; role: Role; exp: number }

function sign(data: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(data).digest('base64url');
}

/** Skeleton signed session: base64url(payload) + "." + hmac. Production: DB-backed session id. */
export function encodeSession(p: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString('base64url');
  return body + '.' + sign(body);
}

export function decodeSession(token?: string): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = sign(body);
  if (expect.length !== sig.length || !timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

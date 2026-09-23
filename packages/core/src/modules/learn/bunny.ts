import { createHash } from 'node:crypto';

/** Bunny Stream Token Authentication：SHA256(signingKey + videoId + expires)（移植自度哥 payment.ts）。 */
export function bunnySign(signingKey: string, videoId: string, expires: number) {
  return createHash('sha256').update(`${signingKey}${videoId}${expires}`).digest('hex');
}


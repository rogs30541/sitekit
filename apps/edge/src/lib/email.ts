import { drizzle } from 'drizzle-orm/d1';
import { emailLogs } from '../db/schema';

export interface EmailEnv {
  DB: D1Database;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

/** Resend 寄信：沒有 API key 就 dry-run（只寫 email_logs），方便本機與 CI。 */
export async function sendEmail(env: EmailEnv, to: string, subject: string, html: string) {
  const db = drizzle(env.DB);
  const id = crypto.randomUUID();
  const base = { id, to, subject, provider: 'resend', createdAt: Date.now() };
  if (!env.RESEND_API_KEY) {
    await db.insert(emailLogs).values({ ...base, status: 'dry-run' });
    return { ok: true, status: 'dry-run' as const, id };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.RESEND_FROM ?? 'SiteKit <onboarding@resend.dev>', to: [to], subject, html }),
    });
    const data = (await res.json()) as { id?: string; message?: string; name?: string };
    if (!res.ok) {
      await db.insert(emailLogs).values({ ...base, status: 'failed', error: `${res.status} ${data.message ?? data.name ?? ''}` });
      return { ok: false, status: 'failed' as const, id, error: data.message ?? `HTTP ${res.status}` };
    }
    await db.insert(emailLogs).values({ ...base, status: 'sent', providerId: data.id ?? null });
    return { ok: true, status: 'sent' as const, id, providerId: data.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.insert(emailLogs).values({ ...base, status: 'failed', error });
    return { ok: false, status: 'failed' as const, id, error };
  }
}

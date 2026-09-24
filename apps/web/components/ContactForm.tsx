'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';

/** 前台聯絡表單（contact 區塊 showForm=true）→ POST /api/content/contact → 後台「表單訊息」＋站主 Email 通知 */
export function ContactForm({ page }: { page?: string }) {
  const [v, setV] = useState({ name: '', email: '', phone: '', subject: '', message: '', website: '' });
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');
  const input = 'w-full border px-3 py-2 text-sm';
  const style = { borderColor: 'var(--line)', background: 'var(--card)', borderRadius: 'var(--radius)', color: 'inherit' } as const;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    setErr('');
    try {
      const r = await fetch('/api/content/contact', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...v, page: page ?? (typeof location !== 'undefined' ? location.pathname : '') }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.message === 'string' ? j.message : Array.isArray(j.message) ? j.message.join('；') : t('送出失敗，請稍後再試'));
      setState('done');
    } catch (e) {
      setState('error');
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  if (state === 'done')
    return (
      <div className="border p-6 text-center" style={style} data-contact-form="done">
        <p className="text-lg font-semibold">{t('已收到您的訊息')}</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{t('我們會盡快回覆您。')}</p>
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-3" data-contact-form>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={input} style={style} required maxLength={80} placeholder={t('姓名')} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <input className={input} style={style} required type="email" maxLength={200} placeholder="Email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        <input className={input} style={style} maxLength={40} placeholder={t('電話（選填）')} value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        <input className={input} style={style} maxLength={120} placeholder={t('主旨（選填）')} value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} />
      </div>
      <textarea className={input} style={style} required rows={5} maxLength={4000} placeholder={t('想詢問的內容')} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} />
      {/* 蜜罐：真人看不到 */}
      <input className="hidden" tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => setV({ ...v, website: e.target.value })} aria-hidden />
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <button disabled={state === 'busy'} className="px-6 py-3 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 'var(--radius)' }}>
        {state === 'busy' ? t('送出中…') : t('送出')}
      </button>
    </form>
  );
}

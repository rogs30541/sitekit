'use client';

import { useState } from 'react';

/**
 * 信件範本：11 種通知信的主旨／內文（{{變數}} 跳脫、{{{變數}}} 原樣 HTML）、自動回覆開關、預覽、重設、測試寄送。
 * 全部走 OPS（list_mail_templates／set_mail_template／preview_mail_template／send_test_notification），與 MCP 同一套。
 */
export interface MailTpl {
  kind: string;
  label: string;
  desc: string;
  to: string;
  optional: boolean;
  vars: { key: string; label: string; html?: boolean }[];
  subject: string;
  body: string;
  enabled: boolean;
  customized: boolean;
  defaultSubject: string;
  defaultBody: string;
}
const act = async <T,>(action: string, params: Record<string, unknown> = {}) => {
  const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, params }) });
  const b = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: T; message?: string };
  if (!r.ok || b.ok === false) throw new Error(b.error ?? b.message ?? `HTTP ${r.status}`);
  return b.data as T;
};
const input = 'w-full rounded border px-2 py-1 text-sm';
const line = { borderColor: 'var(--line)' } as const;

export function MailTemplatesClient({ initial }: { initial: MailTpl[] }) {
  const [list, setList] = useState(initial);
  const [sel, setSel] = useState(initial[0]?.kind ?? '');
  const [draft, setDraft] = useState<{ subject: string; body: string; enabled: boolean } | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const t = list.find((x) => x.kind === sel);
  const cur = draft ?? (t ? { subject: t.subject, body: t.body, enabled: t.enabled } : null);
  const pick = (k: string) => {
    setSel(k);
    setDraft(null);
    setPreview(null);
    setMsg('');
  };
  async function run<T>(fn: () => Promise<T>, done?: (r: T) => void) {
    setBusy(true);
    setMsg('');
    try {
      const r = await fn();
      done?.(r);
    } catch (e) {
      setMsg(`失敗：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }
  const refresh = async () => setList(await act<MailTpl[]>('list_mail_templates'));
  if (!t || !cur) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] text-sm">
      <aside className="space-y-1 text-xs">
        {list.map((x) => (
          <button key={x.kind} onClick={() => pick(x.kind)} className={`block w-full rounded px-2 py-1.5 text-left ${sel === x.kind ? 'bg-black text-white' : 'hover:bg-neutral-100'}`} data-mail-kind={x.kind}>
            <span className="font-semibold">{x.label}</span>
            <span className={`ml-1 rounded px-1 text-[10px] ${sel === x.kind ? 'bg-white/20' : 'bg-neutral-100'}`}>{x.to}</span>
            {x.customized ? <span className="ml-1 text-[10px] text-amber-700">已自訂</span> : null}
            {x.optional && !x.enabled ? <span className="ml-1 text-[10px] text-neutral-500">關閉</span> : null}
          </button>
        ))}
      </aside>
      <section className="space-y-3">
        <div>
          <p className="font-semibold">
            {t.label} <span className="font-mono text-xs" style={{ color: 'var(--muted)' }}>{t.kind}</span>
          </p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{t.desc}。收件對象：{t.to}。</p>
        </div>
        {t.optional ? (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={cur.enabled} onChange={(e) => setDraft({ ...cur, enabled: e.target.checked })} /> 啟用（關閉後不會寄出）
          </label>
        ) : null}
        <label className="block text-xs">
          主旨
          <input className={input} style={line} value={cur.subject} onChange={(e) => setDraft({ ...cur, subject: e.target.value })} />
        </label>
        <label className="block text-xs">
          內文（HTML；會套在網站信件外框內）
          <textarea className={`${input} font-mono`} style={line} rows={10} value={cur.body} onChange={(e) => setDraft({ ...cur, body: e.target.value })} />
        </label>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          可用變數：
          {t.vars.map((v) => (
            <code key={v.key} className="mr-1 rounded bg-neutral-100 px-1">
              {v.html ? `{{{${v.key}}}}` : `{{${v.key}}}`}
              <span className="ml-0.5 text-[10px]">{v.label}</span>
            </code>
          ))}
          <br />
          {'{{變數}}'} 會跳脫 HTML；標示為 HTML 的變數用 {'{{{變數}}}'} 原樣輸出。
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button disabled={busy} onClick={() => void run(() => act<{ subject: string; html: string }>('preview_mail_template', { kind: t.kind, subject: cur.subject, body: cur.body }), setPreview)} className="rounded border px-3 py-1.5" style={line}>
            預覽（範例資料）
          </button>
          <button disabled={busy || !draft} onClick={() => void run(() => act('set_mail_template', { kind: t.kind, subject: cur.subject, body: cur.body, ...(t.optional ? { enabled: cur.enabled } : {}) }), async () => { await refresh(); setDraft(null); setMsg('已儲存。'); })} className="rounded bg-black px-4 py-1.5 text-white disabled:opacity-50" data-mail-save>
            儲存
          </button>
          <button disabled={busy || !t.customized} onClick={() => { if (!confirm('回到預設範本？')) return; void run(() => act('set_mail_template', { kind: t.kind, reset: true }), async () => { await refresh(); setDraft(null); setPreview(null); setMsg('已回到預設。'); }); }} className="rounded border px-3 py-1.5 disabled:opacity-50" style={line}>
            回到預設
          </button>
          <button disabled={busy} onClick={() => void run(() => act<{ mail?: { ok?: boolean; error?: string; provider?: string } }>('send_test_notification', {}), (r) => setMsg(r?.mail?.ok ? `測試信已寄到 mail.adminTo（${r.mail.provider}）` : `測試信失敗：${r?.mail?.error ?? '未設定收件人'}`))} className="rounded border px-3 py-1.5" style={line}>
            寄測試信到站主信箱
          </button>
          {msg ? <span>{msg}</span> : null}
        </div>
        {preview ? (
          <div className="rounded-lg border" style={line}>
            <div className="border-b px-3 py-2 text-xs" style={line}>
              主旨：<b>{preview.subject}</b>
            </div>
            <iframe title="preview" className="h-96 w-full" srcDoc={preview.html} sandbox="" />
          </div>
        ) : null}
      </section>
    </div>
  );
}

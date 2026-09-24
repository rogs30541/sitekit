'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fmtDateTime } from '@/lib/api-public';

export interface MessageRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  page: string | null;
  status: 'new' | 'read' | 'replied' | 'archived';
  note: string | null;
  createdAt: string;
  repliedAt: string | null;
  repliedBy: string | null;
}
const STATUS: Record<MessageRow['status'], string> = { new: '未讀', read: '已讀', replied: '已回覆', archived: '封存' };
const line = { borderColor: 'var(--line)' } as const;

/** 表單訊息：前台 contact 區塊表單送出的訊息；標記狀態／備註／刪除。同功能 MCP：list_contact_messages／update_contact_message／delete_contact_message。 */
export function MessagesClient({ rows: initial, counts }: { rows: MessageRow[]; counts: Record<string, number> }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<'all' | MessageRow['status']>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  async function patch(id: string, body: { status?: string; note?: string }) {
    const r = await fetch(`/api/admin/messages/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(`失敗：${typeof j.message === 'string' ? j.message : r.status}`);
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, ...j } : x)));
    router.refresh();
  }
  async function remove(id: string) {
    if (!window.confirm('刪除這則訊息？')) return;
    const r = await fetch(`/api/admin/messages/${id}`, { method: 'DELETE' });
    if (r.ok) setRows((rs) => rs.filter((x) => x.id !== id));
    router.refresh();
  }
  const list = rows.filter((r) => filter === 'all' || r.status === filter);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(['all', 'new', 'read', 'replied', 'archived'] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-full border px-3 py-1 ${filter === s ? 'bg-black text-white' : ''}`} style={filter === s ? undefined : line}>
            {s === 'all' ? `全部 ${rows.length}` : `${STATUS[s]} ${counts[s] ?? 0}`}
          </button>
        ))}
        {msg ? <span className="text-red-700">{msg}</span> : null}
      </div>
      {!list.length ? <p className="text-xs" style={{ color: 'var(--muted)' }}>沒有訊息。前台「聯絡我們」區塊勾選「顯示聯絡表單」後，訪客送出的內容會出現在這裡並寄到 mail.adminTo。</p> : null}
      <ul className="divide-y rounded-lg border" style={line}>
        {list.map((r) => (
          <li key={r.id} className="p-3" style={line} data-message={r.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-[11px] ${r.status === 'new' ? 'bg-amber-100 text-amber-900' : r.status === 'replied' ? 'bg-green-100 text-green-800' : 'bg-neutral-100'}`}>{STATUS[r.status]}</span>
              <button className="font-semibold hover:underline" onClick={() => { setOpen(open === r.id ? null : r.id); if (r.status === 'new') void patch(r.id, { status: 'read' }); }}>
                {r.subject || '（無主旨）'}
              </button>
              <span style={{ color: 'var(--muted)' }}>
                {r.name} · <a href={`mailto:${r.email}`} className="underline">{r.email}</a>
                {r.phone ? ` · ${r.phone}` : ''}
              </span>
              <span className="ml-auto text-xs" style={{ color: 'var(--muted)' }}>{fmtDateTime(r.createdAt)}{r.page ? ` · ${r.page}` : ''}</span>
            </div>
            {open === r.id ? (
              <div className="mt-2 space-y-2">
                <p className="whitespace-pre-wrap rounded border p-3" style={{ ...line, background: 'var(--soft)' }}>{r.message}</p>
                <label className="block text-xs">
                  內部備註
                  <textarea className="w-full rounded border px-2 py-1 text-sm" style={line} rows={2} defaultValue={r.note ?? ''} onBlur={(e) => e.target.value !== (r.note ?? '') && void patch(r.id, { note: e.target.value })} />
                </label>
                <div className="flex flex-wrap gap-2 text-xs">
                  <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.subject || '您的來信'}`)}`} className="rounded border px-2 py-1" style={line}>
                    以 Email 回覆
                  </a>
                  {r.status !== 'replied' ? (
                    <button onClick={() => void patch(r.id, { status: 'replied' })} className="rounded border px-2 py-1" style={line}>
                      標記已回覆
                    </button>
                  ) : null}
                  {r.status !== 'archived' ? (
                    <button onClick={() => void patch(r.id, { status: 'archived' })} className="rounded border px-2 py-1" style={line}>
                      封存
                    </button>
                  ) : (
                    <button onClick={() => void patch(r.id, { status: 'read' })} className="rounded border px-2 py-1" style={line}>
                      取消封存
                    </button>
                  )}
                  <button onClick={() => void remove(r.id)} className="rounded border px-2 py-1 text-red-700" style={line}>
                    刪除
                  </button>
                  {r.repliedAt ? <span style={{ color: 'var(--muted)' }}>已回覆 {fmtDateTime(r.repliedAt)}{r.repliedBy ? ` by ${r.repliedBy}` : ''}</span> : null}
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

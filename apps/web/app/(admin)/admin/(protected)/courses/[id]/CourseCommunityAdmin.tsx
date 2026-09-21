'use client';

import { useEffect, useState } from 'react';
import { fmtDateTime } from '@/lib/api-public';

interface Q {
  id: string;
  body: string;
  answer: string | null;
  answeredAt: string | null;
  isPublic: boolean;
  status: string;
  createdAt: string;
  user: { displayName: string | null; email: string };
  chapter: { title: string } | null;
}
interface A {
  id: string;
  title: string;
  body: string;
  isPublished: boolean;
  publishedAt: string;
}
const input = 'w-full rounded border px-2 py-1 text-sm';

/** 後台課程頁：回覆提問（會 Email 通知）、控制公開／隱藏；公告 CRUD。同功能 MCP：answer_question／post_announcement。 */
export function CourseCommunityAdmin({ courseId }: { courseId: string }) {
  const [questions, setQuestions] = useState<Q[]>([]);
  const [news, setNews] = useState<A[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ title: '', body: '' });
  const [msg, setMsg] = useState('');

  const load = async () => {
    const [q, a] = await Promise.all([fetch(`/api/admin/courses/${courseId}/questions`).then((r) => (r.ok ? r.json() : [])), fetch(`/api/admin/courses/${courseId}/announcements`).then((r) => (r.ok ? r.json() : []))]);
    setQuestions(q);
    setNews(a);
  };
  useEffect(() => {
    load();
  }, [courseId]);

  async function patchQ(id: string, data: Record<string, unknown>) {
    const r = await fetch(`/api/admin/questions/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    setMsg(r.ok ? '已更新' : '更新失敗');
    load();
  }
  async function createA() {
    const r = await fetch(`/api/admin/courses/${courseId}/announcements`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) });
    setMsg(r.ok ? '公告已發布' : '發布失敗');
    if (r.ok) setForm({ title: '', body: '' });
    load();
  }
  async function delA(id: string) {
    if (!window.confirm('刪除這則公告？')) return;
    await fetch(`/api/admin/announcements/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 text-xs">
      <div>
        <p className="mb-2 text-sm font-semibold">學員提問（{questions.filter((q) => q.status === 'open').length} 則待回覆）</p>
        {questions.length ? (
          <ul className="space-y-2">
            {questions.map((q) => (
              <li key={q.id} className="rounded border p-2" style={{ borderColor: 'var(--line)' }}>
                <p style={{ color: 'var(--muted)' }}>
                  {q.user.displayName ?? q.user.email} · {fmtDateTime(q.createdAt)}
                  {q.chapter ? ` · ${q.chapter.title}` : ''} · {q.status}
                  {!q.isPublic ? ' · 不公開' : ''}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{q.body}</p>
                <textarea className={`${input} mt-1`} style={{ borderColor: 'var(--line)' }} rows={2} placeholder="回覆…" value={drafts[q.id] ?? q.answer ?? ''} onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })} />
                <div className="mt-1 flex flex-wrap gap-2">
                  <button onClick={() => patchQ(q.id, { answer: drafts[q.id] ?? q.answer ?? '' })} className="rounded bg-black px-2 py-0.5 text-white">
                    送出回覆
                  </button>
                  <button onClick={() => patchQ(q.id, { isPublic: !q.isPublic })} className="rounded border px-2 py-0.5" style={{ borderColor: 'var(--line)' }}>
                    {q.isPublic ? '設為不公開' : '設為公開'}
                  </button>
                  <button onClick={() => patchQ(q.id, { status: q.status === 'hidden' ? 'open' : 'hidden' })} className="rounded border px-2 py-0.5" style={{ borderColor: 'var(--line)' }}>
                    {q.status === 'hidden' ? '取消隱藏' : '隱藏'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: 'var(--muted)' }}>尚無提問</p>
        )}
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">公告</p>
        <div className="space-y-1 rounded border p-2" style={{ borderColor: 'var(--line)' }}>
          <input className={input} style={{ borderColor: 'var(--line)' }} placeholder="公告標題" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <textarea className={input} style={{ borderColor: 'var(--line)' }} rows={3} placeholder="公告內容" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <button onClick={createA} disabled={!form.title || !form.body} className="rounded bg-black px-3 py-1 text-white disabled:opacity-50">
            發布公告
          </button>
          {msg ? <span className="ml-2">{msg}</span> : null}
        </div>
        <ul className="mt-2 space-y-2">
          {news.map((a) => (
            <li key={a.id} className="rounded border p-2" style={{ borderColor: 'var(--line)' }}>
              <p className="font-semibold">
                {a.title}
                {!a.isPublished ? '（未發布）' : ''}
              </p>
              <p style={{ color: 'var(--muted)' }}>{fmtDateTime(a.publishedAt)}</p>
              <p className="mt-1 whitespace-pre-wrap">{a.body}</p>
              <button onClick={() => delA(a.id)} className="mt-1 underline text-red-700">
                刪除
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

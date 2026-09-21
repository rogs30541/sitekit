'use client';

import { useEffect, useState } from 'react';
import { fmtDateTime } from '@/lib/api-public';

interface Announcement {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}
interface Question {
  id: string;
  chapterId: string | null;
  body: string;
  answer: string | null;
  answeredAt: string | null;
  isPublic: boolean;
  status: string;
  createdAt: string;
  mine: boolean;
  user: { displayName: string | null };
  chapter: { title: string } | null;
}

/** 教室頁下方：課程公告＋問答（提問需授權；本章提問會帶 chapterId）。 */
export function CommunityPanel({ slug, chapterId, entitled }: { slug: string; chapterId: string; entitled: boolean }) {
  const [tab, setTab] = useState<'qa' | 'news'>('qa');
  const [data, setData] = useState<{ announcements: Announcement[]; questions: Question[] } | null>(null);
  const [body, setBody] = useState('');
  const [thisChapter, setThisChapter] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch(`/api/learn/courses/${encodeURIComponent(slug)}/community`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  useEffect(() => {
    load();
  }, [slug]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const r = await fetch(`/api/learn/courses/${encodeURIComponent(slug)}/questions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body, chapterId: thisChapter ? chapterId : null }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMsg(typeof j.message === 'string' ? j.message : '送出失敗');
      return;
    }
    setBody('');
    setMsg('已送出，回覆後會 Email 通知您。');
    load();
  }

  const questions = data?.questions ?? [];
  const news = data?.announcements ?? [];
  return (
    <div className="mt-4 rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
      <div className="mb-3 flex gap-3 text-sm">
        <button onClick={() => setTab('qa')} className={tab === 'qa' ? 'font-bold underline' : ''}>
          問答（{questions.length}）
        </button>
        <button onClick={() => setTab('news')} className={tab === 'news' ? 'font-bold underline' : ''}>
          公告（{news.length}）
        </button>
      </div>
      {tab === 'news' ? (
        news.length ? (
          <ul className="space-y-3 text-sm">
            {news.map((a) => (
              <li key={a.id}>
                <p className="font-semibold">{a.title}</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {fmtDateTime(a.publishedAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{a.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            尚無公告
          </p>
        )
      ) : (
        <div className="space-y-3 text-sm">
          {entitled ? (
            <form onSubmit={ask} className="space-y-2">
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} required minLength={2} placeholder="對這門課有什麼問題？" className="w-full rounded border px-2 py-1 text-sm" style={{ borderColor: 'var(--line)' }} />
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={thisChapter} onChange={(e) => setThisChapter(e.target.checked)} /> 標記為本章節的問題
                </label>
                <button disabled={busy} className="rounded bg-black px-3 py-1 text-white disabled:opacity-50">
                  送出提問
                </button>
                {msg ? <span>{msg}</span> : null}
              </div>
            </form>
          ) : (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              購買課程後即可提問。
            </p>
          )}
          {questions.length ? (
            <ul className="space-y-3">
              {questions.map((q) => (
                <li key={q.id} className="rounded border p-2" style={{ borderColor: 'var(--line)' }}>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {q.user.displayName ?? '學員'}
                    {q.mine ? '（我）' : ''} · {fmtDateTime(q.createdAt)}
                    {q.chapter ? ` · ${q.chapter.title}` : ''}
                    {!q.isPublic ? ' · 僅自己可見' : ''}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{q.body}</p>
                  {q.answer ? (
                    <div className="mt-2 rounded bg-neutral-50 p-2">
                      <p className="text-xs font-semibold">講師回覆{q.answeredAt ? ` · ${fmtDateTime(q.answeredAt)}` : ''}</p>
                      <p className="whitespace-pre-wrap">{q.answer}</p>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
                      等待回覆
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              還沒有人提問
            </p>
          )}
        </div>
      )}
    </div>
  );
}

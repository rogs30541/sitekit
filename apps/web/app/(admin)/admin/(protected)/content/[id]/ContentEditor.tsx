'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export interface ContentDoc {
  id: string;
  type: 'page' | 'post' | string;
  title: string;
  slug: string;
  body: string | null;
  excerpt: string | null;
  coverUrl: string | null;
  author: string | null;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
  updatedAt: string;
}
const input = 'w-full rounded border px-2 py-1 text-sm';
const TOOLS: { label: string; cmd: string; arg?: string; title: string }[] = [
  { label: 'H2', cmd: 'formatBlock', arg: 'h2', title: '標題 2' },
  { label: 'H3', cmd: 'formatBlock', arg: 'h3', title: '標題 3' },
  { label: '¶', cmd: 'formatBlock', arg: 'p', title: '段落' },
  { label: 'B', cmd: 'bold', title: '粗體' },
  { label: 'I', cmd: 'italic', title: '斜體' },
  { label: 'U', cmd: 'underline', title: '底線' },
  { label: '•', cmd: 'insertUnorderedList', title: '項目符號' },
  { label: '1.', cmd: 'insertOrderedList', title: '編號清單' },
  { label: '❝', cmd: 'formatBlock', arg: 'blockquote', title: '引言' },
  { label: '—', cmd: 'insertHorizontalRule', title: '分隔線' },
  { label: '✕', cmd: 'removeFormat', title: '清除格式' },
];

/** 所見即所得編輯器（contenteditable＋原生命令，零相依）＋ HTML 原始碼切換、圖片上傳（走 /api/admin/content/upload → local／R2）。 */
export function ContentEditor({ doc }: { doc: ContentDoc }) {
  const router = useRouter();
  const editor = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState({ title: doc.title, slug: doc.slug, excerpt: doc.excerpt ?? '', coverUrl: doc.coverUrl ?? '', author: doc.author ?? '', tags: doc.tags.join(', '), status: doc.status });
  const [html, setHtml] = useState(doc.body ?? '');
  const [source, setSource] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!source && editor.current && editor.current.innerHTML !== html) editor.current.innerHTML = html;
  }, [source, html]);

  const syncFromEditor = () => {
    if (editor.current) setHtml(editor.current.innerHTML);
  };
  const exec = (cmd: string, arg?: string) => {
    editor.current?.focus();
    document.execCommand(cmd, false, arg);
    syncFromEditor();
  };
  const link = () => {
    const url = window.prompt('連結網址（https://…）');
    if (url) exec('createLink', url);
  };
  const imageByUrl = () => {
    const url = window.prompt('圖片網址');
    if (url) exec('insertImage', url);
  };
  async function upload(file: File) {
    setBusy(true);
    setMsg('上傳中…');
    const dataBase64 = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(file);
    });
    const r = await fetch('/api/admin/content/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMsg(`上傳失敗：${typeof j.message === 'string' ? j.message : r.status}`);
      return;
    }
    setMsg(`已上傳（${j.driver}）`);
    if (source) setHtml((h) => `${h}\n<img src="${j.url}" alt="">`);
    else exec('insertImage', j.url);
  }

  async function save(status?: ContentDoc['status']) {
    setBusy(true);
    setMsg('');
    const body = source ? html : (editor.current?.innerHTML ?? html);
    const payload = { title: meta.title, slug: meta.slug, excerpt: meta.excerpt || null, coverUrl: meta.coverUrl || null, author: meta.author || null, tags: meta.tags.split(',').map((t) => t.trim()).filter(Boolean), body, status: status ?? meta.status };
    const r = await fetch(`/api/admin/content/${doc.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMsg(`儲存失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
      return;
    }
    setMeta((m) => ({ ...m, slug: j.slug, status: j.status }));
    setMsg(`已儲存（${j.status === 'published' ? '已發布' : '草稿'}）`);
    router.refresh();
  }
  async function remove() {
    if (!window.confirm('確定刪除這篇內容？')) return;
    await fetch(`/api/admin/content/${doc.id}`, { method: 'DELETE' });
    router.push(`/admin/content?type=${doc.type}`);
    router.refresh();
  }

  const publicUrl = doc.type === 'page' ? `/p/${meta.slug}` : `/blog/${meta.slug}`;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-2">
        <input className={`${input} text-lg font-semibold`} style={{ borderColor: 'var(--line)' }} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder="標題" />
        <div className="flex flex-wrap items-center gap-1 rounded-t border border-b-0 p-1 text-xs" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
          {TOOLS.map((t) => (
            <button key={t.label + t.cmd} type="button" title={t.title} onClick={() => exec(t.cmd, t.arg)} disabled={source} className="rounded border px-2 py-0.5 disabled:opacity-40" style={{ borderColor: 'var(--line)' }}>
              {t.label}
            </button>
          ))}
          <button type="button" onClick={link} disabled={source} className="rounded border px-2 py-0.5 disabled:opacity-40" style={{ borderColor: 'var(--line)' }}>
            連結
          </button>
          <button type="button" onClick={imageByUrl} disabled={source} className="rounded border px-2 py-0.5 disabled:opacity-40" style={{ borderColor: 'var(--line)' }}>
            圖片網址
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={busy} className="rounded border px-2 py-0.5 disabled:opacity-40" style={{ borderColor: 'var(--line)' }}>
            上傳圖片
          </button>
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <label className="ml-auto flex items-center gap-1">
            <input
              type="checkbox"
              checked={source}
              onChange={(e) => {
                if (e.target.checked) syncFromEditor();
                setSource(e.target.checked);
              }}
            />
            HTML 原始碼
          </label>
        </div>
        {source ? (
          <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={22} className="w-full rounded-b border p-2 font-mono text-xs" style={{ borderColor: 'var(--line)' }} />
        ) : (
          <div ref={editor} contentEditable suppressContentEditableWarning onInput={syncFromEditor} onBlur={syncFromEditor} className="prose min-h-[24rem] max-w-none rounded-b border p-3 text-sm focus:outline-none" style={{ borderColor: 'var(--line)', background: 'white' }} />
        )}
      </div>
      <div className="space-y-2 text-xs">
        <label className="block">
          slug（網址）
          <input className={`${input} font-mono`} style={{ borderColor: 'var(--line)' }} value={meta.slug} onChange={(e) => setMeta({ ...meta, slug: e.target.value })} />
        </label>
        <label className="block">
          摘要（SEO description）
          <textarea className={input} style={{ borderColor: 'var(--line)' }} rows={3} value={meta.excerpt} onChange={(e) => setMeta({ ...meta, excerpt: e.target.value })} />
        </label>
        <label className="block">
          封面圖網址
          <input className={input} style={{ borderColor: 'var(--line)' }} value={meta.coverUrl} onChange={(e) => setMeta({ ...meta, coverUrl: e.target.value })} />
        </label>
        {doc.type === 'post' ? (
          <>
            <label className="block">
              作者
              <input className={input} style={{ borderColor: 'var(--line)' }} value={meta.author} onChange={(e) => setMeta({ ...meta, author: e.target.value })} />
            </label>
            <label className="block">
              標籤（逗號分隔）
              <input className={input} style={{ borderColor: 'var(--line)' }} value={meta.tags} onChange={(e) => setMeta({ ...meta, tags: e.target.value })} />
            </label>
          </>
        ) : null}
        <p>
          狀態：<strong>{meta.status === 'published' ? '已發布' : meta.status === 'archived' ? '封存' : '草稿'}</strong>
          {meta.status === 'published' ? (
            <>
              {' · '}
              <a href={publicUrl} target="_blank" className="underline">
                檢視 {publicUrl}
              </a>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => save('draft')} disabled={busy} className="rounded border px-3 py-1.5 disabled:opacity-50" style={{ borderColor: 'var(--line)' }}>
            儲存草稿
          </button>
          <button onClick={() => save('published')} disabled={busy} className="rounded bg-black px-3 py-1.5 text-white disabled:opacity-50">
            儲存並發布
          </button>
          {meta.status === 'published' ? (
            <button onClick={() => save('draft')} disabled={busy} className="rounded border px-3 py-1.5 disabled:opacity-50" style={{ borderColor: 'var(--line)' }}>
              下架（改草稿）
            </button>
          ) : null}
          <button onClick={remove} disabled={busy} className="rounded border px-3 py-1.5 text-red-700 disabled:opacity-50" style={{ borderColor: 'var(--line)' }}>
            刪除
          </button>
        </div>
        {msg ? <p>{msg}</p> : null}
      </div>
    </div>
  );
}

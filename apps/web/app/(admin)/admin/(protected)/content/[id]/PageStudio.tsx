'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BLOCK_MAP, designFromHtml, emptyDesign, renderDesignDocument, type DesignDoc, type LintIssue } from '@sitekit/shared';
import { DesignEditor } from './DesignEditor';

export interface DraftPayload {
  content: { id: string; type: string; title: string; slug: string; status: 'draft' | 'published' | 'archived'; version: number; hasDesign: boolean; publishedAt: string | null; updatedAt: string; url: string };
  draft: { title: string; slug: string; excerpt: string | null; coverUrl: string | null; body: string | null; design: DesignDoc | null; updatedAt: string; updatedBy: string | null };
  dirty: boolean;
  lint: LintIssue[];
  preview: { url: string; token: string; expiresAt: string };
}
interface Revision {
  version: number;
  title: string;
  slug: string;
  status: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  hasDesign: boolean;
}
const input = 'w-full rounded border px-2 py-1 text-sm';
const line = { borderColor: 'var(--line)' } as const;
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

async function uploadImage(file: File): Promise<string> {
  const dataBase64 = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
  const r = await fetch('/api/admin/content/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof j.message === 'string' ? j.message : '上傳失敗');
  return j.url as string;
}

/**
 * 頁面工作台（防呆流程）：所有修改只寫「草稿」（自動儲存）→ 沙盒預覽（可分享測試）→ 發佈需再確認（顯示檢測結果＋備份說明）→ 發佈前自動備份上一版 → 版本可還原到草稿再確認。
 * 兩種編輯模式：視覺設計器（Elementor／Webflow 式）與傳統富文本。
 */
export function PageStudio({ initial }: { initial: DraftPayload }) {
  const router = useRouter();
  const [data, setData] = useState<DraftPayload>(initial);
  const [mode, setMode] = useState<'design' | 'classic'>(initial.draft.design ? 'design' : 'classic');
  const [design, setDesign] = useState<DesignDoc>(initial.draft.design ?? emptyDesign());
  const [meta, setMeta] = useState({ title: initial.draft.title, slug: initial.draft.slug, excerpt: initial.draft.excerpt ?? '', coverUrl: initial.draft.coverUrl ?? '' });
  const [html, setHtml] = useState(initial.draft.body ?? '');
  const [source, setSource] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [revOpen, setRevOpen] = useState(false);
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutosave = useRef(true);

  useEffect(() => {
    if (mode === 'classic' && !source && editor.current && editor.current.innerHTML !== html) editor.current.innerHTML = html;
  }, [mode, source, html]);

  const saveDraft = useCallback(
    async (quiet = false) => {
      setSaving('saving');
      const payload = { title: meta.title, slug: meta.slug, excerpt: meta.excerpt || null, coverUrl: meta.coverUrl || null, ...(mode === 'design' ? { design } : { body: source ? html : (editor.current?.innerHTML ?? html), design: null }) };
      const r = await fetch(`/api/admin/content/${data.content.id}/draft`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSaving('error');
        setMsg(`草稿儲存失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
        return null;
      }
      setData(j as DraftPayload);
      setMeta((m) => ({ ...m, slug: (j as DraftPayload).draft.slug }));
      setSaving('saved');
      if (!quiet) setMsg('草稿已儲存（線上頁面未變更）');
      return j as DraftPayload;
    },
    [data.content.id, design, html, meta, mode, source],
  );

  // 自動儲存草稿（1.5 秒）
  useEffect(() => {
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    setSaving('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveDraft(true), 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design, meta, html, mode]);

  const syncFromEditor = () => {
    if (editor.current) setHtml(editor.current.innerHTML);
  };
  const exec = (cmd: string, arg?: string) => {
    editor.current?.focus();
    document.execCommand(cmd, false, arg);
    syncFromEditor();
  };

  async function openPreview() {
    const d = await saveDraft(true);
    const r = await fetch(`/api/admin/content/${data.content.id}/preview-token`, { method: 'POST' });
    const j = await r.json().catch(() => null);
    const url = j?.url ?? d?.preview.url ?? data.preview.url;
    window.open(url, '_blank', 'noopener');
    setMsg(`沙盒預覽連結（2 小時有效，可交給測試者）：${url}`);
  }
  async function loadRevisions() {
    const r = await fetch(`/api/admin/content/${data.content.id}/revisions`);
    const j = await r.json().catch(() => null);
    setRevisions(j?.revisions ?? []);
    setRevOpen(true);
  }
  async function restore(v: number) {
    if (!window.confirm(`把第 ${v} 版還原到「草稿」？（線上頁面不會改變，還原後請預覽並再次確認發佈）`)) return;
    const r = await fetch(`/api/admin/content/${data.content.id}/revisions/${v}/restore`, { method: 'POST' });
    const j = (await r.json().catch(() => null)) as DraftPayload | null;
    if (!r.ok || !j) return setMsg('還原失敗');
    applyPayload(j);
    setRevOpen(false);
    setMsg(`已把第 ${v} 版還原到草稿；請沙盒預覽後再發佈`);
  }
  function applyPayload(j: DraftPayload) {
    skipAutosave.current = true;
    setData(j);
    setMeta({ title: j.draft.title, slug: j.draft.slug, excerpt: j.draft.excerpt ?? '', coverUrl: j.draft.coverUrl ?? '' });
    if (j.draft.design) {
      setDesign(j.draft.design);
      setMode('design');
    } else {
      setHtml(j.draft.body ?? '');
      setMode('classic');
    }
  }
  async function unpublish() {
    if (!window.confirm('把線上頁面下架（改為草稿狀態）？前台將無法存取此頁。')) return;
    const r = await fetch(`/api/admin/content/${data.content.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'draft' }) });
    if (r.ok) {
      setData((d) => ({ ...d, content: { ...d.content, status: 'draft' } }));
      setMsg('已下架');
      router.refresh();
    }
  }
  async function remove() {
    if (!window.confirm('確定刪除這個內容（含草稿與所有版本）？此動作不可復原。')) return;
    if (!window.confirm('再次確認：刪除後線上頁面立即消失。')) return;
    await fetch(`/api/admin/content/${data.content.id}`, { method: 'DELETE' });
    router.push(data.content.type === 'post' ? '/admin/posts' : '/admin/content');
    router.refresh();
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify({ title: meta.title, slug: meta.slug, excerpt: meta.excerpt || null, coverUrl: meta.coverUrl || null, design: mode === 'design' ? design : designFromHtml(html) }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${meta.slug || 'page'}.design.json`;
    a.click();
  }
  async function importJson(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      const r = await fetch(`/api/admin/content/${data.content.id}/draft`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ design: parsed.design ?? parsed, ...(parsed.title ? { title: parsed.title } : {}) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.message === 'string' ? j.message : '匯入失敗');
      applyPayload(j as DraftPayload);
      setMsg('已匯入設計 JSON 到草稿（尚未發佈）');
    } catch (e) {
      setMsg(`匯入失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  function switchMode(to: 'design' | 'classic') {
    if (to === mode) return;
    if (to === 'design') {
      if (!design.root.children?.length && html.trim()) setDesign(designFromHtml(html));
      setMode('design');
    } else {
      if (!window.confirm('切回傳統編輯器會以目前設計器的 HTML 輸出作為內文（設計結構不再可視覺編輯）。確定？')) return;
      setHtml(renderDesignDocument(design));
      setMode('classic');
    }
  }

  const c = data.content;
  const dirty = saving === 'dirty' || saving === 'saving' || data.dirty;
  return (
    <div className="space-y-2">
      {/* 頂列 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs" style={{ ...line, background: 'var(--card)' }}>
        <input className={`${input} max-w-64 font-semibold`} style={line} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder="標題" />
        <span className="flex items-center gap-1 font-mono">
          {c.type === 'page' ? '/p/' : '/blog/'}
          <input className={`${input} w-36 font-mono`} style={line} value={meta.slug} onChange={(e) => setMeta({ ...meta, slug: e.target.value })} />
        </span>
        <span className={`rounded px-2 py-0.5 ${c.status === 'published' ? 'bg-green-100 text-green-800' : c.status === 'archived' ? 'bg-neutral-200' : 'bg-neutral-100'}`}>{c.status === 'published' ? `線上 v${c.version}` : c.status === 'archived' ? '封存' : '未上線'}</span>
        <span className={`rounded px-2 py-0.5 ${saving === 'error' ? 'bg-red-100 text-red-800' : dirty ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100'}`}>{saving === 'saving' ? '儲存草稿中…' : saving === 'error' ? '草稿儲存失敗' : dirty ? '草稿有未發佈變更' : '草稿＝線上'}</span>
        <span className="ml-auto flex flex-wrap items-center gap-1">
          <span className="rounded border" style={line}>
            <button onClick={() => switchMode('design')} className={`px-2 py-1 ${mode === 'design' ? 'bg-black text-white' : ''}`}>
              視覺設計器
            </button>
            <button onClick={() => switchMode('classic')} className={`px-2 py-1 ${mode === 'classic' ? 'bg-black text-white' : ''}`}>
              傳統編輯器
            </button>
          </span>
          <button onClick={() => void saveDraft()} className="rounded border px-2 py-1" style={line}>
            儲存草稿
          </button>
          <button onClick={openPreview} className="rounded border px-2 py-1" style={line}>
            沙盒預覽
          </button>
          <button onClick={loadRevisions} className="rounded border px-2 py-1" style={line}>
            版本
          </button>
          <button onClick={exportJson} className="rounded border px-2 py-1" style={line}>
            匯出 JSON
          </button>
          <label className="cursor-pointer rounded border px-2 py-1" style={line}>
            匯入 JSON
            <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </label>
          <button onClick={() => setPublishOpen(true)} className="rounded bg-black px-3 py-1 font-semibold text-white">
            發佈…
          </button>
          {c.status === 'published' ? (
            <button onClick={unpublish} className="rounded border px-2 py-1" style={line}>
              下架
            </button>
          ) : null}
          <button onClick={remove} className="rounded border px-2 py-1 text-red-700" style={line}>
            刪除
          </button>
        </span>
      </div>
      {msg ? (
        <p className="break-all text-xs" style={{ color: 'var(--muted)' }}>
          {msg}
        </p>
      ) : null}

      {mode === 'design' ? (
        <DesignEditor doc={design} onChange={setDesign} onUpload={uploadImage} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1fr_16rem]">
          <div>
            <div className="flex flex-wrap items-center gap-1 rounded-t border border-b-0 p-1 text-xs" style={{ ...line, background: 'var(--card)' }}>
              {TOOLS.map((t) => (
                <button key={t.label + t.cmd} type="button" title={t.title} onClick={() => exec(t.cmd, t.arg)} disabled={source} className="rounded border px-2 py-0.5 disabled:opacity-40" style={line}>
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const url = window.prompt('連結網址（https://…）');
                  if (url) exec('createLink', url);
                }}
                disabled={source}
                className="rounded border px-2 py-0.5 disabled:opacity-40"
                style={line}
              >
                連結
              </button>
              <label className="cursor-pointer rounded border px-2 py-0.5" style={line}>
                上傳圖片
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const url = await uploadImage(f);
                      if (source) setHtml((h) => `${h}\n<img src="${url}" alt="">`);
                      else exec('insertImage', url);
                    } catch (err) {
                      setMsg(err instanceof Error ? err.message : String(err));
                    }
                  }}
                />
              </label>
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
              <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={22} className="w-full rounded-b border p-2 font-mono text-xs" style={line} />
            ) : (
              <div ref={editor} contentEditable suppressContentEditableWarning onInput={syncFromEditor} onBlur={syncFromEditor} className="prose min-h-[24rem] max-w-none rounded-b border p-3 text-sm focus:outline-none" style={{ ...line, background: 'white' }} />
            )}
          </div>
          <div className="space-y-2 text-xs">
            <label className="block">
              摘要（SEO description）
              <textarea className={input} style={line} rows={3} value={meta.excerpt} onChange={(e) => setMeta({ ...meta, excerpt: e.target.value })} />
            </label>
            <label className="block">
              封面圖網址
              <input className={input} style={line} value={meta.coverUrl} onChange={(e) => setMeta({ ...meta, coverUrl: e.target.value })} />
            </label>
            <p style={{ color: 'var(--muted)' }}>想要拖曳排版、RWD 多裝置與區塊模板，切到「視覺設計器」（會把目前內文放進一個富文本區塊）。</p>
          </div>
        </div>
      )}

      {publishOpen ? (
        <PublishDialog
          data={data}
          lint={mode === 'design' ? data.lint : []}
          onClose={() => setPublishOpen(false)}
          onBeforePublish={() => saveDraft(true)}
          onPublished={(j) => {
            setPublishOpen(false);
            setData((d) => ({ ...d, dirty: false, content: { ...d.content, status: 'published', version: j.version, url: j.url } }));
            setSaving('saved');
            setMsg(`已發佈為第 ${j.version} 版${j.backedUpVersion !== null ? `（上一版已備份為第 ${j.backedUpVersion} 版，可在「版本」還原）` : ''}：${j.url}`);
            router.refresh();
          }}
        />
      ) : null}
      {revOpen ? (
        <Modal title={`版本紀錄（線上目前 v${c.version}）`} onClose={() => setRevOpen(false)}>
          <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
            每次發佈前，系統自動把當時的線上版本備份在此。「還原」只會把該版本放回草稿，需再沙盒預覽並確認發佈才會上線。
          </p>
          {revisions === null ? (
            <p>載入中…</p>
          ) : !revisions.length ? (
            <p className="text-xs">尚無歷史版本（第一次發佈後才會產生備份）。</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr style={{ color: 'var(--muted)' }}>
                  <th className="py-1">版本</th>
                  <th className="py-1">標題／slug</th>
                  <th className="py-1">備份時間</th>
                  <th className="py-1">操作者</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {revisions.map((r) => (
                  <tr key={r.version} className="border-t" style={line}>
                    <td className="py-1">v{r.version}</td>
                    <td className="py-1">
                      {r.title} <span className="font-mono opacity-60">/{r.slug}</span> {r.hasDesign ? <span className="rounded bg-neutral-100 px-1 text-[10px]">設計器</span> : null}
                    </td>
                    <td className="py-1">{new Date(r.createdAt).toLocaleString('zh-TW')}</td>
                    <td className="py-1">{r.createdBy ?? '—'}</td>
                    <td className="py-1 text-right">
                      <button onClick={() => restore(r.version)} className="rounded border px-2 py-0.5" style={line}>
                        還原到草稿
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      ) : null}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl border bg-white p-4 shadow-xl" style={line} onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} className="rounded border px-2 py-0.5 text-xs" style={line}>
            關閉
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 發佈確認：顯示檢測（error 阻擋）、備份說明、需勾選「已在沙盒預覽確認」 */
function PublishDialog({ data, lint, onClose, onBeforePublish, onPublished }: { data: DraftPayload; lint: LintIssue[]; onClose: () => void; onBeforePublish: () => Promise<DraftPayload | null>; onPublished: (j: { version: number; backedUpVersion: number | null; url: string }) => void }) {
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fresh, setFresh] = useState<LintIssue[]>(lint);
  useEffect(() => {
    // 先把最新草稿存好並取回伺服器端檢測結果
    onBeforePublish().then((d) => d && setFresh(d.lint));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const errors = fresh.filter((l) => l.level === 'error');
  const warns = fresh.filter((l) => l.level === 'warn');
  const c = data.content;
  async function publish() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/admin/content/${c.id}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true, note }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
    onPublished(j);
  }
  return (
    <Modal title="確認發佈到線上" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="rounded-lg border p-3 text-xs" style={line}>
          <div>
            頁面：<strong>{data.draft.title}</strong> <span className="font-mono">{c.type === 'page' ? (data.draft.slug === 'home' ? '/' : `/p/${data.draft.slug}`) : `/blog/${data.draft.slug}`}</span>
          </div>
          <div className="mt-1">
            {c.status === 'published' ? (
              <>
                線上目前為 <strong>第 {c.version} 版</strong>，發佈後成為 <strong>第 {c.version + 1} 版</strong>；系統會先把第 {c.version} 版備份到「版本」，發現錯誤可隨時還原。
              </>
            ) : c.version > 0 ? (
              <>此頁目前未上線（最後版本 v{c.version}）；發佈後將重新上線為第 {c.version + 1} 版，上一版會備份。</>
            ) : (
              <>此頁尚未上線；發佈後前台可存取（第 1 版）。</>
            )}
          </div>
        </div>
        {errors.length ? (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
            <div className="font-semibold">發佈前檢測未通過（需先修正）：</div>
            <ul className="list-disc pl-4">
              {errors.map((e, i) => (
                <li key={i}>
                  {BLOCK_MAP[e.type]?.label ?? e.type}：{e.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {warns.length ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold">提醒（不阻擋）：</div>
            <ul className="list-disc pl-4">
              {warns.map((e, i) => (
                <li key={i}>
                  {BLOCK_MAP[e.type]?.label ?? e.type}：{e.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <label className="block text-xs">
          版本備註（選填）
          <input className={input} style={line} value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：改首屏文案" />
        </label>
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
          <span>
            我已在<strong>沙盒預覽</strong>確認過草稿內容無誤，了解發佈會立即變更線上頁面（上一版會自動備份）。
          </span>
        </label>
        {err ? <p className="text-xs text-red-700">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded border px-3 py-1.5 text-xs" style={line}>
            取消
          </button>
          <button onClick={publish} disabled={busy || !checked || errors.length > 0} className="rounded bg-black px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
            {busy ? '發佈中…' : '確認發佈'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

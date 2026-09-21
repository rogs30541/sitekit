'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VideoUrlField, type ResolvedVideo } from './VideoUrlField';
import type { VideoAsset } from './VideoLibrary';

export interface AdminChapter {
  id: string;
  parentId: string | null;
  order: number;
  title: string;
  body: string | null;
  videoProvider: 'bunny' | 'youtube';
  videoProviderId: string | null;
  durationSec: number | null;
  isPreview: boolean;
  isPublished: boolean;
}
type Node = AdminChapter & { children: AdminChapter[] };

const input = 'w-full rounded border px-2 py-1 text-sm';
const btn = 'rounded border px-2 py-0.5 text-xs disabled:opacity-40';

function toTree(chapters: AdminChapter[]): Node[] {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const roots = sorted.filter((c) => !c.parentId || !chapters.some((p) => p.id === c.parentId));
  return roots.map((r) => ({ ...r, children: sorted.filter((c) => c.parentId === r.id) }));
}
function toItems(tree: Node[]) {
  const items: { id: string; parentId: string | null; order: number }[] = [];
  tree.forEach((r, i) => {
    items.push({ id: r.id, parentId: null, order: i });
    r.children.forEach((c, j) => items.push({ id: c.id, parentId: r.id, order: j }));
  });
  return items;
}
const fmtDur = (s: number | null) => (s ? `${String(Math.floor(s / 3600)).padStart(2, '0')} 時 ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} 分 ${String(s % 60).padStart(2, '0')} 秒` : '-- 時 -- 分 -- 秒');

/**
 * 章節樹（兩層）：拖曳把手可在同層排序或拖到根章節上成為子章節；也有 ▲▼ 與升降階按鈕。
 * 點標題開右側抽屜編輯；貼 YouTube 網址即時顯示縮圖。
 */
export function ChapterTree({ courseId, chapters, videos }: { courseId: string; chapters: AdminChapter[]; videos: VideoAsset[] }) {
  const router = useRouter();
  const [tree, setTree] = useState<Node[]>(() => toTree(chapters));
  const [editing, setEditing] = useState<AdminChapter | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [msg, setMsg] = useState('');
  const flat = useMemo(() => tree.flatMap((r) => [r, ...r.children]), [tree]);

  async function persist(next: Node[]) {
    setTree(next);
    const r = await fetch(`/api/admin/catalog/courses/${courseId}/reorder`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: toItems(next) }) });
    setMsg(r.ok ? '順序已儲存' : `排序失敗 ${r.status}`);
    router.refresh();
  }

  // ---- 移動操作 ----
  function moveSibling(id: string, delta: number) {
    const next = tree.map((r) => ({ ...r, children: [...r.children] }));
    const ri = next.findIndex((r) => r.id === id);
    if (ri >= 0) {
      const to = ri + delta;
      if (to < 0 || to >= next.length) return;
      [next[ri], next[to]] = [next[to], next[ri]];
      return persist(next);
    }
    for (const r of next) {
      const ci = r.children.findIndex((c) => c.id === id);
      if (ci >= 0) {
        const to = ci + delta;
        if (to < 0 || to >= r.children.length) return;
        [r.children[ci], r.children[to]] = [r.children[to], r.children[ci]];
        return persist(next);
      }
    }
  }
  function indent(id: string) {
    const next = tree.map((r) => ({ ...r, children: [...r.children] }));
    const ri = next.findIndex((r) => r.id === id);
    if (ri <= 0) return;
    const [node] = next.splice(ri, 1);
    next[ri - 1].children.push(...[{ ...node, children: undefined } as unknown as AdminChapter, ...node.children]);
    persist(next);
  }
  function outdent(id: string) {
    const next = tree.map((r) => ({ ...r, children: [...r.children] }));
    for (let ri = 0; ri < next.length; ri++) {
      const ci = next[ri].children.findIndex((c) => c.id === id);
      if (ci >= 0) {
        const [node] = next[ri].children.splice(ci, 1);
        next.splice(ri + 1, 0, { ...node, children: [] });
        return persist(next);
      }
    }
  }
  function dropOn(targetId: string, mode: 'before' | 'after' | 'child') {
    if (!dragId || dragId === targetId) return;
    const next = tree.map((r) => ({ ...r, children: [...r.children] }));
    // 取出被拖曳節點（根或子）
    let node: Node | null = null;
    const ri = next.findIndex((r) => r.id === dragId);
    if (ri >= 0) node = next.splice(ri, 1)[0];
    else
      for (const r of next) {
        const ci = r.children.findIndex((c) => c.id === dragId);
        if (ci >= 0) node = { ...r.children.splice(ci, 1)[0], children: [] };
      }
    if (!node) return;
    if (mode === 'child') {
      const target = next.find((r) => r.id === targetId);
      if (!target) return;
      target.children.push({ ...node, children: undefined } as unknown as AdminChapter, ...node.children);
      return persist(next);
    }
    // before / after：目標是根 → 插在根層；目標是子 → 插在同一父的子層（被拖節點的子章節升為根）
    const tri = next.findIndex((r) => r.id === targetId);
    if (tri >= 0) {
      next.splice(mode === 'before' ? tri : tri + 1, 0, node);
      return persist(next);
    }
    for (const r of next) {
      const ci = r.children.findIndex((c) => c.id === targetId);
      if (ci >= 0) {
        r.children.splice(mode === 'before' ? ci : ci + 1, 0, { ...node, children: undefined } as unknown as AdminChapter);
        if (node.children.length) next.push(...node.children.map((c) => ({ ...c, children: [] })));
        return persist(next);
      }
    }
  }

  async function addChapter(parentId: string | null, title: string) {
    if (!title.trim()) return;
    const r = await fetch(`/api/admin/catalog/courses/${courseId}/chapters`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: title.trim(), parentId, videoProvider: 'youtube' }) });
    if (r.ok) {
      const ch = (await r.json()) as AdminChapter;
      setNewTitle('');
      setTree(parentId ? tree.map((rt) => (rt.id === parentId ? { ...rt, children: [...rt.children, ch] } : rt)) : [...tree, { ...ch, children: [] }]);
      setEditing(ch);
    }
    router.refresh();
  }

  function onSaved(updated: AdminChapter | null, deletedId?: string) {
    if (deletedId) setTree(tree.filter((r) => r.id !== deletedId).map((r) => ({ ...r, children: r.children.filter((c) => c.id !== deletedId) })));
    else if (updated) setTree(tree.map((r) => (r.id === updated.id ? { ...r, ...updated } : { ...r, children: r.children.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)) })));
    setEditing(null);
    router.refresh();
  }

  const Row = ({ ch, depth, index, count }: { ch: AdminChapter; depth: number; index: number; count: number }) => {
    const [over, setOver] = useState<'before' | 'after' | 'child' | null>(null);
    const hasVideo = !!ch.videoProviderId;
    return (
      <div
        className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs ${editing?.id === ch.id ? 'bg-neutral-50' : ''} ${over === 'before' ? 'border-t-2 border-t-black' : over === 'after' ? 'border-b-2 border-b-black' : over === 'child' ? 'ring-2 ring-black' : ''}`}
        style={{ borderColor: 'var(--line)', marginLeft: depth * 24 }}
        onDragOver={(e) => {
          if (!dragId || dragId === ch.id) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          const y = (e.clientY - r.top) / r.height;
          setOver(depth === 0 && e.clientX - r.left > r.width * 0.6 && y > 0.25 && y < 0.75 ? 'child' : y < 0.5 ? 'before' : 'after');
        }}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => {
          e.preventDefault();
          if (over) dropOn(ch.id, over);
          setOver(null);
        }}
      >
        <span draggable onDragStart={() => setDragId(ch.id)} onDragEnd={() => setDragId(null)} className="cursor-grab select-none px-1 text-base leading-none" title="拖曳排序；拖到根章節右側成為子章節" style={{ color: 'var(--muted)' }}>
          ⋮⋮
        </span>
        <button type="button" onClick={() => setEditing(ch)} className="flex-1 truncate text-left font-semibold hover:underline">
          {ch.title}
        </button>
        <span className={`rounded px-1.5 py-0.5 ${ch.isPublished ? 'bg-green-100 text-green-800' : 'bg-neutral-200'}`}>{ch.isPublished ? '已發布' : '草稿'}</span>
        {ch.isPreview ? <span className="rounded bg-neutral-100 px-1.5 py-0.5">試看</span> : null}
        <span style={{ color: 'var(--muted)' }}>{hasVideo ? fmtDur(ch.durationSec) : '無影片'}</span>
        <button className={btn} style={{ borderColor: 'var(--line)' }} disabled={index === 0} onClick={() => moveSibling(ch.id, -1)} title="上移">
          ▲
        </button>
        <button className={btn} style={{ borderColor: 'var(--line)' }} disabled={index === count - 1} onClick={() => moveSibling(ch.id, 1)} title="下移">
          ▼
        </button>
        {depth === 0 ? (
          <button className={btn} style={{ borderColor: 'var(--line)' }} disabled={index === 0} onClick={() => indent(ch.id)} title="成為上一個章節的子章節">
            ⇥
          </button>
        ) : (
          <button className={btn} style={{ borderColor: 'var(--line)' }} onClick={() => outdent(ch.id)} title="升為根章節">
            ⇤
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-1.5">
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          拖曳 ⋮⋮ 排序；拖到根章節右側可變成子章節。點標題編輯。{msg ? ` · ${msg}` : ''}
        </p>
        {tree.map((r, i) => (
          <div key={r.id} className="space-y-1.5">
            <Row ch={r} depth={0} index={i} count={tree.length} />
            {r.children.map((c, j) => (
              <Row key={c.id} ch={c} depth={1} index={j} count={r.children.length} />
            ))}
            {editing?.id === r.id ? null : null}
          </div>
        ))}
        <div className="flex gap-2 pt-2">
          <input className={input} style={{ borderColor: 'var(--line)' }} placeholder="新章節標題" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addChapter(null, newTitle)} />
          <button onClick={() => addChapter(null, newTitle)} className="whitespace-nowrap rounded bg-black px-3 py-1 text-xs text-white">
            新增章節
          </button>
        </div>
      </div>
      <div>
        {editing ? (
          <ChapterDrawer key={editing.id} chapter={editing} videos={videos} parents={tree.filter((r) => r.id !== editing.id)} onClose={() => setEditing(null)} onSaved={onSaved} onAddChild={(t) => addChapter(editing.id, t)} />
        ) : (
          <div className="rounded-lg border p-4 text-xs" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
            點左側章節標題開始編輯。
          </div>
        )}
      </div>
    </div>
  );
}

function ChapterDrawer({ chapter, videos, parents, onClose, onSaved, onAddChild }: { chapter: AdminChapter; videos: VideoAsset[]; parents: Node[]; onClose: () => void; onSaved: (c: AdminChapter | null, deletedId?: string) => void; onAddChild: (title: string) => void }) {
  const [f, setF] = useState({ title: chapter.title, parentId: chapter.parentId ?? '', body: chapter.body ?? '', videoProvider: chapter.videoProvider, bunnyId: chapter.videoProvider === 'bunny' ? (chapter.videoProviderId ?? '') : '', isPreview: chapter.isPreview, isPublished: chapter.isPublished });
  const [video, setVideo] = useState<ResolvedVideo | null>(chapter.videoProvider === 'youtube' && chapter.videoProviderId ? { provider: 'youtube', id: chapter.videoProviderId, title: videos.find((v) => v.externalId === chapter.videoProviderId)?.title ?? null, thumbnailUrl: `https://i.ytimg.com/vi/${chapter.videoProviderId}/hqdefault.jpg` } : null);
  const d = chapter.durationSec ?? 0;
  const [dur, setDur] = useState({ h: Math.floor(d / 3600), m: Math.floor((d % 3600) / 60), s: d % 60 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [childTitle, setChildTitle] = useState('');
  const isRoot = !chapter.parentId;

  async function save() {
    setBusy(true);
    setMsg('');
    const durationSec = dur.h * 3600 + dur.m * 60 + dur.s;
    const body = { title: f.title, parentId: f.parentId || null, body: f.body || null, videoProvider: f.videoProvider, videoProviderId: f.videoProvider === 'youtube' ? (video?.id ?? null) : f.bunnyId || null, durationSec: durationSec || null, isPreview: f.isPreview, isPublished: f.isPublished };
    const r = await fetch(`/api/admin/catalog/chapters/${chapter.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg(`失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
    setMsg('已儲存');
    onSaved(j as AdminChapter);
  }
  async function remove() {
    if (!window.confirm(`刪除章節「${chapter.title}」？子章節會升為根章節。`)) return;
    await fetch(`/api/admin/catalog/chapters/${chapter.id}`, { method: 'DELETE' });
    onSaved(null, chapter.id);
  }

  return (
    <div className="sticky top-4 space-y-3 rounded-lg border p-4 text-xs" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">正在編輯 {chapter.title}</p>
        <button onClick={onClose} className={btn} style={{ borderColor: 'var(--line)' }}>
          關閉
        </button>
      </div>
      <label>
        章節名稱
        <input className={input} style={{ borderColor: 'var(--line)' }} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      </label>
      <label>
        所屬單元（父章節）
        <select className={input} style={{ borderColor: 'var(--line)' }} value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}>
          <option value="">（根層）</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <div>
        <p className="mb-1">上傳課程內容</p>
        <select className={input} style={{ borderColor: 'var(--line)' }} value={f.videoProvider} onChange={(e) => setF({ ...f, videoProvider: e.target.value as 'youtube' | 'bunny' })}>
          <option value="youtube">Youtube 內嵌（隱藏來源播放器）</option>
          <option value="bunny">Bunny Stream（自架簽章）</option>
        </select>
        <div className="mt-2">
          {f.videoProvider === 'youtube' ? (
            <>
              <VideoUrlField value={video} onChange={setVideo} compact />
              {videos.length ? (
                <select className={`${input} mt-2`} style={{ borderColor: 'var(--line)' }} value="" onChange={(e) => {
                  const v = videos.find((x) => x.externalId === e.target.value);
                  if (v) setVideo({ provider: 'youtube', id: v.externalId, title: v.title, thumbnailUrl: v.thumbnailUrl });
                }}>
                  <option value="">或從影片庫選擇…</option>
                  {videos.map((v) => (
                    <option key={v.id} value={v.externalId}>
                      {v.title}
                    </option>
                  ))}
                </select>
              ) : null}
            </>
          ) : (
            <input className={input} style={{ borderColor: 'var(--line)' }} placeholder="Bunny video GUID" value={f.bunnyId} onChange={(e) => setF({ ...f, bunnyId: e.target.value })} />
          )}
        </div>
      </div>
      <div>
        <p className="mb-1">課程時長（0＝前台不顯示）</p>
        <div className="flex items-center gap-1">
          <input className="w-14 rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }} type="number" min={0} value={dur.h} onChange={(e) => setDur({ ...dur, h: Number(e.target.value) })} /> 時
          <input className="w-14 rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }} type="number" min={0} max={59} value={dur.m} onChange={(e) => setDur({ ...dur, m: Number(e.target.value) })} /> 分
          <input className="w-14 rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }} type="number" min={0} max={59} value={dur.s} onChange={(e) => setDur({ ...dur, s: Number(e.target.value) })} /> 秒
        </div>
      </div>
      <label>
        章節說明（選填）
        <textarea className={input} style={{ borderColor: 'var(--line)' }} rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={f.isPreview} onChange={(e) => setF({ ...f, isPreview: e.target.checked })} /> 免費試看
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={f.isPublished} onChange={() => setF({ ...f, isPublished: true })} /> 發布
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={!f.isPublished} onChange={() => setF({ ...f, isPublished: false })} /> 草稿
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={busy} className="rounded bg-black px-3 py-1 text-white disabled:opacity-50">
          儲存章節
        </button>
        <button onClick={remove} className={btn} style={{ borderColor: 'var(--line)' }}>
          刪除
        </button>
        <span style={{ color: 'var(--muted)' }}>{msg}</span>
      </div>
      {isRoot ? (
        <div className="border-t pt-3" style={{ borderColor: 'var(--line)' }}>
          <p className="mb-1">在此單元下新增子章節</p>
          <div className="flex gap-2">
            <input className={input} style={{ borderColor: 'var(--line)' }} placeholder="子章節標題" value={childTitle} onChange={(e) => setChildTitle(e.target.value)} />
            <button onClick={() => (onAddChild(childTitle), setChildTitle(''))} className="whitespace-nowrap rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }}>
              新增
            </button>
          </div>
        </div>
      ) : null}
      <p style={{ color: 'var(--muted)' }}>章節與課程設定是分開儲存的。</p>
    </div>
  );
}

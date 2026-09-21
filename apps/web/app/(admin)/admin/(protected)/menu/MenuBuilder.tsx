'use client';

import { useMemo, useState } from 'react';

export interface MenuNode {
  id: string;
  label: string;
  kind: string;
  contentId: string | null;
  href: string;
  isVisible: boolean;
  newTab: boolean;
  content?: { title: string; slug: string; type: string; status: string } | null;
  children: MenuNode[];
}
export interface PageRow {
  id: string;
  type: string;
  title: string;
  slug: string;
  status: string;
}
interface Node {
  key: string;
  label: string;
  kind: 'page' | 'route' | 'link';
  contentId: string | null;
  href: string;
  isVisible: boolean;
  newTab: boolean;
  children: Node[];
}
type Drag = { type: 'node'; key: string } | { type: 'new'; node: Omit<Node, 'key' | 'children'> };

const ROUTES: { label: string; href: string }[] = [
  { label: '官網', href: '/' },
  { label: '文章', href: '/blog' },
  { label: '商城', href: '/store' },
  { label: '購物車', href: '/cart' },
  { label: '課程', href: '/courses' },
  { label: 'AI 工作站', href: '/studio' },
  { label: '會員中心', href: '/member' },
  { label: '登入', href: '/login' },
];
let seq = 0;
const nk = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;
const fromApi = (n: MenuNode): Node => ({ key: n.id, label: n.label, kind: (n.kind as Node['kind']) ?? 'route', contentId: n.contentId, href: n.kind === 'page' ? '' : n.href, isVisible: n.isVisible, newTab: n.newTab, children: n.children.map(fromApi) });
const toApi = (n: Node): Record<string, unknown> => ({ label: n.label, kind: n.kind, contentId: n.kind === 'page' ? n.contentId : null, href: n.kind === 'page' ? null : n.href, isVisible: n.isVisible, newTab: n.newTab, children: n.children.map(toApi) });

function removeKey(list: Node[], key: string): { list: Node[]; removed: Node | null } {
  let removed: Node | null = null;
  const out = list
    .filter((n) => {
      if (n.key === key) {
        removed = n;
        return false;
      }
      return true;
    })
    .map((n) => {
      if (removed) return n;
      const r = removeKey(n.children, key);
      if (r.removed) removed = r.removed;
      return { ...n, children: r.list };
    });
  return { list: out, removed };
}
/** 插入到 target 的前／後／子層（子層只允許根節點） */
function insertAt(list: Node[], targetKey: string | null, where: 'before' | 'after' | 'child' | 'end', node: Node): Node[] {
  if (targetKey === null) return where === 'before' ? [node, ...list] : [...list, node];
  const out: Node[] = [];
  for (const n of list) {
    if (n.key === targetKey) {
      if (where === 'before') out.push(node, n);
      else if (where === 'after') out.push(n, node);
      else out.push({ ...n, children: [...n.children, { ...node, children: [] }] });
      continue;
    }
    if (n.children.some((c) => c.key === targetKey)) {
      const kids: Node[] = [];
      for (const c of n.children) {
        if (c.key === targetKey) {
          if (where === 'before') kids.push(node, c);
          else kids.push(c, node);
        } else kids.push(c);
      }
      out.push({ ...n, children: kids.map((k) => ({ ...k, children: [] })) });
      continue;
    }
    out.push(n);
  }
  return out;
}

/** 拖曳組樹：左側來源（頁面／系統路徑／外部連結）→ 右側樹；樹內拖曳排序與縮排；整棵 PUT /api/admin/menu。 */
export function MenuBuilder({ initial, pages }: { initial: MenuNode[]; pages: PageRow[] }) {
  const [tree, setTree] = useState<Node[]>(initial.map(fromApi));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<{ key: string | null; where: 'before' | 'after' | 'child' | 'end' } | null>(null);
  const [link, setLink] = useState({ label: '', href: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const used = useMemo(() => new Set([...tree, ...tree.flatMap((n) => n.children)].map((n) => n.contentId).filter(Boolean)), [tree]);

  const newFromPage = (p: PageRow): Omit<Node, 'key' | 'children'> => ({ label: p.title, kind: 'page', contentId: p.id, href: '', isVisible: true, newTab: false });
  const newFromRoute = (r: { label: string; href: string }): Omit<Node, 'key' | 'children'> => ({ label: r.label, kind: 'route', contentId: null, href: r.href, isVisible: true, newTab: false });

  function place(d: Drag, targetKey: string | null, where: 'before' | 'after' | 'child' | 'end') {
    let list = tree;
    let node: Node;
    if (d.type === 'node') {
      if (d.key === targetKey) return;
      const r = removeKey(list, d.key);
      if (!r.removed) return;
      list = r.list;
      node = r.removed;
      if (where === 'child' && node.children.length) return; // 有子項的節點不能再縮排
    } else node = { ...d.node, key: nk(), children: [] };
    setTree(insertAt(list, targetKey, where, node));
  }
  const dropHandlers = (targetKey: string | null, where: 'before' | 'after' | 'child' | 'end') => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver({ key: targetKey, where });
    },
    onDragLeave: () => setOver(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(null);
      if (drag) place(drag, targetKey, where);
      setDrag(null);
    },
  });
  const update = (key: string, patch: Partial<Node>) => setTree((t) => t.map((n) => (n.key === key ? { ...n, ...patch } : { ...n, children: n.children.map((c) => (c.key === key ? { ...c, ...patch } : c)) })));
  const remove = (key: string) => setTree((t) => removeKey(t, key).list);

  async function save() {
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/admin/menu', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: tree.map(toApi) }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMsg(`儲存失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
      return;
    }
    setTree((j as MenuNode[]).map(fromApi));
    setMsg('已儲存，前台導覽已更新。');
  }

  const isOver = (key: string | null, where: string) => over?.key === key && over.where === where;
  const Row = ({ n, depth }: { n: Node; depth: number }) => (
    <li>
      <div className={`h-1 rounded ${isOver(n.key, 'before') ? 'bg-black' : ''}`} {...dropHandlers(n.key, 'before')} />
      <div className={`flex flex-wrap items-center gap-1 rounded border px-2 py-1 text-xs ${drag?.type === 'node' && drag.key === n.key ? 'opacity-40' : ''}`} style={{ borderColor: 'var(--line)', marginLeft: depth * 24, background: 'var(--card)' }}>
        <span draggable onDragStart={() => setDrag({ type: 'node', key: n.key })} onDragEnd={() => setDrag(null)} className="cursor-grab select-none text-base leading-none" title="拖曳排序" style={{ color: 'var(--muted)' }}>
          ⋮⋮
        </span>
        <input value={n.label} onChange={(e) => update(n.key, { label: e.target.value })} className="w-32 rounded border px-1 py-0.5" style={{ borderColor: 'var(--line)' }} />
        <span style={{ color: 'var(--muted)' }}>{n.kind === 'page' ? `頁面：${pages.find((p) => p.id === n.contentId)?.title ?? '（已刪除）'}` : n.kind === 'route' ? `路徑：${n.href}` : '外部連結'}</span>
        {n.kind === 'link' ? <input value={n.href} onChange={(e) => update(n.key, { href: e.target.value })} className="w-48 rounded border px-1 py-0.5" style={{ borderColor: 'var(--line)' }} placeholder="https://…" /> : null}
        <label className="ml-auto flex items-center gap-1">
          <input type="checkbox" checked={n.isVisible} onChange={(e) => update(n.key, { isVisible: e.target.checked })} /> 顯示
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={n.newTab} onChange={(e) => update(n.key, { newTab: e.target.checked })} /> 新分頁
        </label>
        <button onClick={() => remove(n.key)} className="text-red-700 underline">
          移除
        </button>
        {depth === 0 ? <span className={`ml-1 rounded border px-1 ${isOver(n.key, 'child') ? 'bg-black text-white' : ''}`} style={{ borderColor: 'var(--line)' }} {...dropHandlers(n.key, 'child')} title="拖到這裡成為子選單">↳ 子選單</span> : null}
      </div>
      {n.children.length ? (
        <ul className="mt-1 space-y-1">
          {n.children.map((c) => (
            <Row key={c.key} n={c} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
      <div className={`h-1 rounded ${isOver(n.key, 'after') ? 'bg-black' : ''}`} {...dropHandlers(n.key, 'after')} />
    </li>
  );

  const Source = ({ node, label, hint, disabled }: { node: Omit<Node, 'key' | 'children'>; label: string; hint?: string; disabled?: boolean }) => (
    <li className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${disabled ? 'opacity-40' : ''}`} style={{ borderColor: 'var(--line)' }} draggable={!disabled} onDragStart={() => !disabled && setDrag({ type: 'new', node })} onDragEnd={() => setDrag(null)}>
      <span className="cursor-grab" style={{ color: 'var(--muted)' }}>
        ⋮⋮
      </span>
      <span className="flex-1">
        {label}
        {hint ? (
          <span className="ml-1" style={{ color: 'var(--muted)' }}>
            {hint}
          </span>
        ) : null}
      </span>
      <button disabled={disabled} onClick={() => setTree((t) => [...t, { ...node, key: nk(), children: [] }])} className="underline disabled:no-underline">
        加入
      </button>
    </li>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      <div className="space-y-3">
        <div>
          <p className="mb-1 text-sm font-semibold">頁面與文章</p>
          <ul className="space-y-1">
            {pages.map((p) => (
              <Source key={p.id} node={newFromPage(p)} label={p.title} hint={`${p.type === 'page' ? '/p/' : '/blog/'}${p.slug}${p.status !== 'published' ? '（草稿）' : ''}`} disabled={used.has(p.id)} />
            ))}
            {!pages.length ? (
              <li className="text-xs" style={{ color: 'var(--muted)' }}>
                尚無頁面，先到「內容編輯」建立。
              </li>
            ) : null}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold">系統路徑</p>
          <ul className="space-y-1">
            {ROUTES.map((r) => (
              <Source key={r.href} node={newFromRoute(r)} label={r.label} hint={r.href} />
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold">外部連結</p>
          <div className="flex flex-wrap gap-1 text-xs">
            <input className="w-24 rounded border px-1 py-0.5" style={{ borderColor: 'var(--line)' }} placeholder="名稱" value={link.label} onChange={(e) => setLink({ ...link, label: e.target.value })} />
            <input className="w-40 rounded border px-1 py-0.5" style={{ borderColor: 'var(--line)' }} placeholder="https://…" value={link.href} onChange={(e) => setLink({ ...link, href: e.target.value })} />
            <button
              disabled={!link.label || !/^https?:\/\//.test(link.href)}
              onClick={() => {
                setTree((t) => [...t, { key: nk(), label: link.label, kind: 'link', contentId: null, href: link.href, isVisible: true, newTab: true, children: [] }]);
                setLink({ label: '', href: '' });
              }}
              className="underline disabled:no-underline disabled:opacity-40"
            >
              加入
            </button>
          </div>
        </div>
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">網站架構樹（前台導覽）</p>
        <ul className="space-y-1 rounded-lg border p-3" style={{ borderColor: 'var(--line)', minHeight: '12rem' }}>
          {tree.map((n) => (
            <Row key={n.key} n={n} depth={0} />
          ))}
          <li className={`rounded border border-dashed p-2 text-center text-xs ${isOver(null, 'end') ? 'bg-neutral-100' : ''}`} style={{ borderColor: 'var(--line)', color: 'var(--muted)' }} {...dropHandlers(null, 'end')}>
            {tree.length ? '拖到這裡加到最後' : '把左側項目拖進來，或按「加入」；留空則前台用預設導覽'}
          </li>
        </ul>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={save} disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? '儲存中…' : '儲存網站架構'}
          </button>
          {msg ? <span className="text-xs">{msg}</span> : null}
        </div>
      </div>
    </div>
  );
}

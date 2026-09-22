'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BLOCK_DEFS, BLOCK_MAP, BREAKPOINTS, STYLE_FIELDS, TEMPLATES, cloneNode, findNode, findParent, insertNode, isContainerType, lintDesign, moveNode, parseDesignDoc, removeNode, renderDesign, updateNode, uid, type Breakpoint, type DesignDoc, type DesignNode } from '@sitekit/shared';

type PropField = { key: string; label: string; kind: 'text' | 'textarea' | 'code' | 'number' | 'select' | 'bool' | 'image' | 'lines' | 'faq'; options?: string[]; min?: number; max?: number };
const PROP_FIELDS: Record<string, PropField[]> = {
  section: [{ key: 'contentWidth', label: '內容最大寬（如 1100px）', kind: 'text' }],
  columns: [{ key: 'cols', label: '欄數（1–6）', kind: 'number', min: 1, max: 6 }],
  heading: [
    { key: 'level', label: '層級', kind: 'select', options: ['1', '2', '3', '4'] },
    { key: 'text', label: '文字', kind: 'textarea' },
  ],
  text: [{ key: 'text', label: '文字（Enter 換行）', kind: 'textarea' }],
  richtext: [{ key: 'html', label: 'HTML', kind: 'code' }],
  html: [{ key: 'html', label: 'HTML（不可含 script）', kind: 'code' }],
  button: [
    { key: 'text', label: '文字', kind: 'text' },
    { key: 'href', label: '連結', kind: 'text' },
    { key: 'variant', label: '樣式', kind: 'select', options: ['primary', 'outline', 'ghost'] },
    { key: 'newTab', label: '另開新分頁', kind: 'bool' },
  ],
  image: [
    { key: 'src', label: '圖片', kind: 'image' },
    { key: 'alt', label: '替代文字', kind: 'text' },
    { key: 'href', label: '點擊連結（選填）', kind: 'text' },
  ],
  video: [
    { key: 'src', label: '影片網址（mp4／webm）', kind: 'text' },
    { key: 'poster', label: '封面圖', kind: 'image' },
    { key: 'controls', label: '顯示控制列', kind: 'bool' },
    { key: 'autoplay', label: '自動播放（靜音循環）', kind: 'bool' },
  ],
  embed: [{ key: 'url', label: 'YouTube／Vimeo 網址', kind: 'text' }],
  quote: [
    { key: 'text', label: '引言', kind: 'textarea' },
    { key: 'cite', label: '出處', kind: 'text' },
  ],
  list: [
    { key: 'items', label: '項目（每行一項）', kind: 'lines' },
    { key: 'ordered', label: '編號清單', kind: 'bool' },
    { key: 'icon', label: '項目符號', kind: 'text' },
  ],
  iconbox: [
    { key: 'icon', label: '圖示（emoji）', kind: 'text' },
    { key: 'title', label: '標題', kind: 'text' },
    { key: 'text', label: '說明', kind: 'textarea' },
  ],
  card: [
    { key: 'image', label: '圖片', kind: 'image' },
    { key: 'title', label: '標題', kind: 'text' },
    { key: 'text', label: '說明', kind: 'textarea' },
    { key: 'buttonText', label: '按鈕文字', kind: 'text' },
    { key: 'href', label: '按鈕連結', kind: 'text' },
  ],
  faq: [{ key: 'items', label: '問答', kind: 'faq' }],
  products: [
    { key: 'title', label: '標題', kind: 'text' },
    { key: 'limit', label: '顯示筆數', kind: 'number', min: 1, max: 24 },
  ],
  courses: [
    { key: 'title', label: '標題', kind: 'text' },
    { key: 'limit', label: '顯示筆數', kind: 'number', min: 1, max: 24 },
  ],
  posts: [
    { key: 'title', label: '標題', kind: 'text' },
    { key: 'limit', label: '顯示筆數', kind: 'number', min: 1, max: 24 },
  ],
};
const input = 'w-full rounded border px-2 py-1 text-xs';
const line = { borderColor: 'var(--line)' } as const;
const DT_BLOCK = 'application/x-sk-block';
const DT_TPL = 'application/x-sk-template';
const DT_MOVE = 'application/x-sk-move';

export interface DesignEditorProps {
  doc: DesignDoc;
  onChange: (doc: DesignDoc) => void;
  onUpload?: (file: File) => Promise<string>;
}

type Drop = { id: string; pos: 'before' | 'after' | 'inside' } | null;

/**
 * 視覺設計器：左＝物件庫／區塊模板／圖層樹；中＝畫布（同一份渲染器＝所見即所得，可拖放、雙擊改文字、三種裝置寬度）；右＝內容屬性／樣式（依斷點）／程式碼（乾淨 HTML／CSS 與 JSON）。
 */
export function DesignEditor({ doc, onChange, onUpload }: DesignEditorProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<Breakpoint>('base');
  const [left, setLeft] = useState<'blocks' | 'templates' | 'layers'>('blocks');
  const [right, setRight] = useState<'props' | 'style' | 'code'>('props');
  const [drop, setDrop] = useState<Drop>(null);
  const [zoom, setZoom] = useState(1);
  const history = useRef<{ past: DesignDoc[]; future: DesignDoc[] }>({ past: [], future: [] });
  const canvas = useRef<HTMLDivElement>(null);
  const canvasWrap = useRef<HTMLDivElement>(null);

  const commit = useCallback(
    (next: DesignDoc) => {
      history.current.past = [...history.current.past.slice(-60), doc];
      history.current.future = [];
      onChange(next);
    },
    [doc, onChange],
  );
  const setRoot = (root: DesignNode) => commit({ ...doc, root });
  const undo = () => {
    const prev = history.current.past.pop();
    if (!prev) return;
    history.current.future.push(doc);
    onChange(prev);
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(doc);
    onChange(next);
  };

  const node = selected ? findNode(doc.root, selected) : null;
  const rendered = useMemo(() => renderDesign(doc, { mode: 'editor', selected }), [doc, selected]);
  const live = useMemo(() => renderDesign(doc, { mode: 'live' }), [doc]);
  const lint = useMemo(() => lintDesign(doc), [doc]);

  // 自動依畫布容器寬度縮放（桌機 1200 放不下時）
  useEffect(() => {
    const el = canvasWrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = BREAKPOINTS.find((b) => b.key === device)!.width;
      setZoom(Math.min(1, (el.clientWidth - 24) / w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [device]);

  /* ---------- 插入／移動 ---------- */
  const place = (target: Drop, make: () => DesignNode | null, moveId?: string) => {
    if (!target) return;
    let parentId = target.id;
    let index = 0;
    if (target.pos === 'inside') {
      const t = findNode(doc.root, target.id);
      index = t?.children?.length ?? 0;
    } else {
      const p = findParent(doc.root, target.id);
      if (!p) return;
      parentId = p.parent.id;
      index = p.index + (target.pos === 'after' ? 1 : 0);
    }
    if (moveId) {
      setRoot(moveNode(doc.root, moveId, parentId, index));
      setSelected(moveId);
      return;
    }
    const n = make();
    if (!n) return;
    setRoot(insertNode(doc.root, parentId, index, n));
    setSelected(n.id);
    setRight('props');
  };
  const addAtEnd = (make: () => DesignNode) => {
    // 加到目前選取的容器內，否則加到根
    const sel = node && isContainerType(node.type) ? node : node ? findParent(doc.root, node.id)?.parent : null;
    const target = sel ?? doc.root;
    const n = make();
    setRoot(insertNode(doc.root, target.id, target.children?.length ?? 0, n));
    setSelected(n.id);
    setRight('props');
  };
  const del = (id: string) => {
    setRoot(removeNode(doc.root, id));
    setSelected(null);
  };
  const dup = (id: string) => {
    const n = findNode(doc.root, id);
    const p = findParent(doc.root, id);
    if (!n || !p) return;
    const c = cloneNode(n);
    setRoot(insertNode(doc.root, p.parent.id, p.index + 1, c));
    setSelected(c.id);
  };
  const shift = (id: string, dir: -1 | 1) => {
    const p = findParent(doc.root, id);
    if (!p) return;
    const to = p.index + dir;
    if (to < 0 || to >= (p.parent.children?.length ?? 0)) return;
    setRoot(moveNode(doc.root, id, p.parent.id, dir > 0 ? to + 1 : to));
  };
  const patchProps = (id: string, patch: Record<string, unknown>) => setRoot(updateNode(doc.root, id, (x) => ({ ...x, props: { ...x.props, ...patch } })));
  const patchStyle = (id: string, bp: Breakpoint, key: string, value: string) => setRoot(updateNode(doc.root, id, (x) => ({ ...x, style: { ...(x.style ?? {}), [bp]: { ...(x.style?.[bp] ?? {}), [key]: value || undefined } } })));

  /* ---------- 畫布事件（事件委派到 data-sk） ---------- */
  const skOf = (e: React.SyntheticEvent | Event) => (e.target as HTMLElement).closest<HTMLElement>('[data-sk]');
  const onCanvasClick = (e: React.MouseEvent) => {
    const el = skOf(e);
    e.preventDefault();
    setSelected(el?.dataset.sk ?? null);
  };
  const onCanvasDblClick = (e: React.MouseEvent) => {
    const el = skOf(e);
    if (!el) return;
    const type = el.dataset.skType;
    if (type !== 'heading' && type !== 'text') return;
    el.contentEditable = 'true';
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const finish = () => {
      el.contentEditable = 'false';
      const text = type === 'text' ? el.innerText : el.textContent ?? '';
      patchProps(el.dataset.sk!, { text: text.replace(/ /g, ' ') });
      el.removeEventListener('blur', finish);
    };
    el.addEventListener('blur', finish);
    el.addEventListener('keydown', (ke) => {
      if (ke.key === 'Escape') el.blur();
    });
  };
  const dropTarget = (e: React.DragEvent): Drop => {
    const el = skOf(e);
    if (!el) return { id: 'root', pos: 'inside' };
    const id = el.dataset.sk!;
    const type = el.dataset.skType!;
    const r = el.getBoundingClientRect();
    const y = (e.clientY - r.top) / Math.max(1, r.height);
    if (isContainerType(type) && y > 0.25 && y < 0.75) return { id, pos: 'inside' };
    return { id, pos: y < 0.5 ? 'before' : 'after' };
  };
  const onDragOver = (e: React.DragEvent) => {
    if (![DT_BLOCK, DT_TPL, DT_MOVE].some((t) => e.dataTransfer.types.includes(t))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(DT_MOVE) ? 'move' : 'copy';
    const t = dropTarget(e);
    setDrop((d) => (d?.id === t?.id && d?.pos === t?.pos ? d : t));
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const t = dropTarget(e);
    setDrop(null);
    const block = e.dataTransfer.getData(DT_BLOCK);
    const tpl = e.dataTransfer.getData(DT_TPL);
    const mv = e.dataTransfer.getData(DT_MOVE);
    if (mv) return place(t, () => null, mv);
    if (block) return place(t, () => BLOCK_MAP[block]?.make() ?? null);
    if (tpl) return place(t, () => TEMPLATES.find((x) => x.key === tpl)?.make() ?? null);
  };
  // 畫布內的拖曳（移動既有節點）
  const onCanvasDragStart = (e: React.DragEvent) => {
    const el = skOf(e);
    if (!el) return;
    e.dataTransfer.setData(DT_MOVE, el.dataset.sk!);
    e.dataTransfer.effectAllowed = 'move';
  };
  useEffect(() => {
    // 讓畫布內元素可拖曳
    canvas.current?.querySelectorAll<HTMLElement>('[data-sk]').forEach((el) => {
      el.draggable = true;
    });
    // 標示放置位置
    canvas.current?.querySelectorAll('.sk-drop-before,.sk-drop-after,.sk-drop-inside').forEach((el) => el.classList.remove('sk-drop-before', 'sk-drop-after', 'sk-drop-inside'));
    if (drop && drop.id !== 'root') canvas.current?.querySelector(`[data-sk="${drop.id}"]`)?.classList.add(`sk-drop-${drop.pos}`);
  }, [rendered, drop]);

  // 快捷鍵
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement).isContentEditable) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selected) {
        e.preventDefault();
        dup(selected);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        del(selected);
      } else if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const width = BREAKPOINTS.find((b) => b.key === device)!.width;
  const parent = node ? findParent(doc.root, node.id) : null;

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: '15rem minmax(0,1fr) 19rem' }}>
      {/* 左欄 */}
      <aside className="rounded-lg border text-xs" style={line}>
        <div className="flex border-b" style={line}>
          {(['blocks', 'templates', 'layers'] as const).map((k) => (
            <button key={k} onClick={() => setLeft(k)} className={`flex-1 px-2 py-1.5 ${left === k ? 'font-bold' : 'opacity-70'}`}>
              {k === 'blocks' ? '物件' : k === 'templates' ? '區塊模板' : '圖層'}
            </button>
          ))}
        </div>
        <div className="max-h-[70vh] overflow-auto p-2">
          {left === 'blocks' ? (
            ['版面', '基礎', '媒體', '內容', '商務'].map((cat) => (
              <div key={cat} className="mb-2">
                <div className="mb-1 font-semibold" style={{ color: 'var(--muted)' }}>
                  {cat}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {BLOCK_DEFS.filter((b) => b.category === cat && b.type !== 'column').map((b) => (
                    <div
                      key={b.type}
                      draggable
                      title={`${b.desc}（拖到畫布或點擊加入）`}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DT_BLOCK, b.type);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      onClick={() => addAtEnd(b.make)}
                      className="cursor-grab rounded border px-2 py-1.5 text-center hover:bg-neutral-50 active:cursor-grabbing"
                      style={line}
                    >
                      {b.label}
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : left === 'templates' ? (
            <div className="space-y-1">
              {TEMPLATES.map((t) => (
                <div
                  key={t.key}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DT_TPL, t.key);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => {
                    const n = t.make();
                    setRoot(insertNode(doc.root, 'root', doc.root.children?.length ?? 0, n));
                    setSelected(n.id);
                  }}
                  className="cursor-grab rounded border px-2 py-1.5 hover:bg-neutral-50"
                  style={line}
                >
                  <div className="font-semibold">{t.label}</div>
                  <div style={{ color: 'var(--muted)' }}>{t.desc}</div>
                </div>
              ))}
            </div>
          ) : (
            <Layers root={doc.root} selected={selected} onSelect={setSelected} onMove={(id, parentId, index) => setRoot(moveNode(doc.root, id, parentId, index))} />
          )}
        </div>
      </aside>

      {/* 畫布 */}
      <section className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-1 text-xs">
          {BREAKPOINTS.map((b) => (
            <button key={b.key} onClick={() => setDevice(b.key)} className={`rounded border px-2 py-1 ${device === b.key ? 'bg-black text-white' : ''}`} style={line} title={`${b.width}px`}>
              {b.label}
            </button>
          ))}
          <span className="ml-1" style={{ color: 'var(--muted)' }}>
            {width}px{zoom < 1 ? `（縮放 ${Math.round(zoom * 100)}%）` : ''}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <button onClick={undo} className="rounded border px-2 py-1" style={line} title="復原 Ctrl+Z">
              ↶
            </button>
            <button onClick={redo} className="rounded border px-2 py-1" style={line} title="重做 Ctrl+Y">
              ↷
            </button>
            {node ? (
              <>
                <span className="rounded bg-neutral-100 px-2 py-1">
                  {BLOCK_MAP[node.type]?.label ?? node.type} <span className="font-mono opacity-60">#{node.id}</span>
                </span>
                {parent && parent.parent.id !== 'root' ? (
                  <button onClick={() => setSelected(parent.parent.id)} className="rounded border px-2 py-1" style={line} title="選取父層">
                    ↰ 父層
                  </button>
                ) : null}
                <button onClick={() => shift(node.id, -1)} className="rounded border px-2 py-1" style={line} title="上移">
                  ↑
                </button>
                <button onClick={() => shift(node.id, 1)} className="rounded border px-2 py-1" style={line} title="下移">
                  ↓
                </button>
                <button onClick={() => dup(node.id)} className="rounded border px-2 py-1" style={line} title="複製 Ctrl+D">
                  ⧉
                </button>
                <button onClick={() => del(node.id)} className="rounded border px-2 py-1 text-red-700" style={line} title="刪除 Delete">
                  ✕
                </button>
              </>
            ) : (
              <span style={{ color: 'var(--muted)' }}>點選畫布元素以編輯；雙擊標題／文字可直接改字</span>
            )}
          </span>
        </div>
        <div ref={canvasWrap} className="overflow-auto rounded-lg border bg-neutral-100 p-3" style={{ ...line, maxHeight: '72vh' }}>
          <div style={{ width: width * zoom, height: 'auto' }}>
            <div
              ref={canvas}
              onClick={onCanvasClick}
              onDoubleClick={onCanvasDblClick}
              onDragOver={onDragOver}
              onDragLeave={() => setDrop(null)}
              onDrop={onDrop}
              onDragStart={onCanvasDragStart}
              className="min-h-[60vh] bg-white shadow"
              style={{ width, transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            >
              <style dangerouslySetInnerHTML={{ __html: rendered.css }} />
              <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
            </div>
          </div>
        </div>
        {lint.length ? (
          <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
            {lint.slice(0, 6).map((l, i) => (
              <button key={i} onClick={() => setSelected(l.nodeId)} className={`rounded px-1.5 py-0.5 ${l.level === 'error' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                {l.level === 'error' ? '錯誤' : '提醒'}：{BLOCK_MAP[l.type]?.label ?? l.type} {l.message}
              </button>
            ))}
            {lint.length > 6 ? <span style={{ color: 'var(--muted)' }}>…共 {lint.length} 項</span> : null}
          </div>
        ) : null}
      </section>

      {/* 右欄 */}
      <aside className="rounded-lg border text-xs" style={line}>
        <div className="flex border-b" style={line}>
          {(['props', 'style', 'code'] as const).map((k) => (
            <button key={k} onClick={() => setRight(k)} className={`flex-1 px-2 py-1.5 ${right === k ? 'font-bold' : 'opacity-70'}`}>
              {k === 'props' ? '內容' : k === 'style' ? '樣式' : '程式碼'}
            </button>
          ))}
        </div>
        <div className="max-h-[70vh] space-y-2 overflow-auto p-2">
          {right === 'props' ? (
            node ? (
              <PropsPanel node={node} onPatch={(p) => patchProps(node.id, p)} onUpload={onUpload} />
            ) : (
              <PageSettings doc={doc} onChange={commit} />
            )
          ) : right === 'style' ? (
            node ? (
              <StylePanel node={node} device={device} onDevice={setDevice} onPatch={(bp, k, v) => patchStyle(node.id, bp, k, v)} />
            ) : (
              <p style={{ color: 'var(--muted)' }}>先在畫布選取元素。樣式可分「桌機／平板／手機」各自覆寫（先切換上方裝置）。</p>
            )
          ) : (
            <CodePanel doc={doc} html={live.html} css={live.css} onApply={commit} />
          )}
        </div>
      </aside>
    </div>
  );
}

/* ---------- 圖層樹（可拖曳排序／移動到其他容器） ---------- */
function Layers({ root, selected, onSelect, onMove }: { root: DesignNode; selected: string | null; onSelect: (id: string) => void; onMove: (id: string, parentId: string, index: number) => void }) {
  const [over, setOver] = useState<string | null>(null);
  const Row = ({ n, depth }: { n: DesignNode; depth: number }) => (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DT_MOVE, n.id);
          e.stopPropagation();
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DT_MOVE)) return;
          e.preventDefault();
          e.stopPropagation();
          setOver(n.id);
        }}
        onDragLeave={() => setOver((o) => (o === n.id ? null : o))}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(null);
          const id = e.dataTransfer.getData(DT_MOVE);
          if (!id || id === n.id) return;
          if (isContainerType(n.type)) onMove(id, n.id, n.children?.length ?? 0);
          else {
            const p = findParent(root, n.id);
            if (p) onMove(id, p.parent.id, p.index + 1);
          }
        }}
        onClick={() => onSelect(n.id)}
        className={`flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 ${selected === n.id ? 'bg-black text-white' : over === n.id ? 'bg-blue-50' : 'hover:bg-neutral-100'}`}
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        <span className="opacity-50">{isContainerType(n.type) ? '▾' : '·'}</span>
        <span>{BLOCK_MAP[n.type]?.label ?? n.type}</span>
        <span className="truncate opacity-60">{String(n.props.text ?? n.props.title ?? n.props.alt ?? '').slice(0, 18)}</span>
      </div>
      {(n.children ?? []).map((c) => (
        <Row key={c.id} n={c} depth={depth + 1} />
      ))}
    </div>
  );
  return (
    <div>
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DT_MOVE)) e.preventDefault();
        }}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(DT_MOVE);
          if (id) onMove(id, 'root', root.children?.length ?? 0);
        }}
        className="mb-1 rounded border border-dashed px-2 py-1 text-center"
        style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}
      >
        頁面（拖到這裡＝移到最外層末端）
      </div>
      {(root.children ?? []).map((c) => (
        <Row key={c.id} n={c} depth={0} />
      ))}
    </div>
  );
}

/* ---------- 內容屬性 ---------- */
function PropsPanel({ node, onPatch, onUpload }: { node: DesignNode; onPatch: (p: Record<string, unknown>) => void; onUpload?: (f: File) => Promise<string> }) {
  const fields = PROP_FIELDS[node.type] ?? [];
  const p = node.props;
  return (
    <div className="space-y-2">
      <div className="font-semibold">
        {BLOCK_MAP[node.type]?.label ?? node.type}
        <span className="ml-1 font-normal" style={{ color: 'var(--muted)' }}>
          {BLOCK_MAP[node.type]?.desc}
        </span>
      </div>
      {!fields.length ? <p style={{ color: 'var(--muted)' }}>此元素沒有內容屬性；到「樣式」調整外觀，或拖曳物件進來。</p> : null}
      {fields.map((f) => {
        const v = p[f.key];
        if (f.kind === 'bool')
          return (
            <label key={f.key} className="flex items-center gap-2">
              <input type="checkbox" checked={!!v} onChange={(e) => onPatch({ [f.key]: e.target.checked })} /> {f.label}
            </label>
          );
        if (f.kind === 'select')
          return (
            <label key={f.key} className="block">
              {f.label}
              <select className={input} style={line} value={String(v ?? '')} onChange={(e) => onPatch({ [f.key]: f.key === 'level' ? Number(e.target.value) : e.target.value })}>
                {f.options!.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          );
        if (f.kind === 'number')
          return (
            <label key={f.key} className="block">
              {f.label}
              <input type="number" className={input} style={line} min={f.min} max={f.max} value={Number(v ?? f.min ?? 0)} onChange={(e) => onPatch({ [f.key]: Math.max(f.min ?? -Infinity, Math.min(f.max ?? Infinity, Number(e.target.value) || 0)) })} />
            </label>
          );
        if (f.kind === 'textarea' || f.kind === 'code')
          return (
            <label key={f.key} className="block">
              {f.label}
              <textarea className={`${input} ${f.kind === 'code' ? 'font-mono' : ''}`} style={line} rows={f.kind === 'code' ? 8 : 3} value={String(v ?? '')} onChange={(e) => onPatch({ [f.key]: e.target.value })} />
            </label>
          );
        if (f.kind === 'lines')
          return (
            <label key={f.key} className="block">
              {f.label}
              <textarea className={input} style={line} rows={4} value={Array.isArray(v) ? (v as unknown[]).join('\n') : ''} onChange={(e) => onPatch({ [f.key]: e.target.value.split('\n') })} />
            </label>
          );
        if (f.kind === 'faq') {
          const items = Array.isArray(v) ? (v as { q: string; a: string }[]) : [];
          return (
            <div key={f.key} className="space-y-1">
              <div>{f.label}</div>
              {items.map((it, i) => (
                <div key={i} className="rounded border p-1" style={line}>
                  <input className={input} style={line} placeholder="問題" value={it.q ?? ''} onChange={(e) => onPatch({ items: items.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} />
                  <textarea className={`${input} mt-1`} style={line} rows={2} placeholder="回答" value={it.a ?? ''} onChange={(e) => onPatch({ items: items.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} />
                  <button className="mt-1 text-red-700" onClick={() => onPatch({ items: items.filter((_, j) => j !== i) })}>
                    移除
                  </button>
                </div>
              ))}
              <button className="rounded border px-2 py-0.5" style={line} onClick={() => onPatch({ items: [...items, { q: '', a: '' }] })}>
                ＋ 問答
              </button>
            </div>
          );
        }
        if (f.kind === 'image')
          return (
            <div key={f.key} className="space-y-1">
              <label className="block">
                {f.label}（網址）
                <input className={input} style={line} value={String(v ?? '')} onChange={(e) => onPatch({ [f.key]: e.target.value })} placeholder="https://… 或上傳" />
              </label>
              {onUpload ? (
                <label className="inline-block cursor-pointer rounded border px-2 py-0.5" style={line}>
                  上傳圖片
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = await onUpload(file);
                      if (url) onPatch({ [f.key]: url });
                    }}
                  />
                </label>
              ) : null}
              {v ? <img src={String(v)} alt="" className="max-h-24 rounded border" style={line} /> : null}
            </div>
          );
        return (
          <label key={f.key} className="block">
            {f.label}
            <input className={input} style={line} value={String(v ?? '')} onChange={(e) => onPatch({ [f.key]: e.target.value })} />
          </label>
        );
      })}
    </div>
  );
}

/* ---------- 樣式（依斷點） ---------- */
function StylePanel({ node, device, onDevice, onPatch }: { node: DesignNode; device: Breakpoint; onDevice: (b: Breakpoint) => void; onPatch: (bp: Breakpoint, k: string, v: string) => void }) {
  const cur = node.style?.[device] ?? {};
  const base = node.style?.base ?? {};
  const groups = Array.from(new Set(STYLE_FIELDS.map((f) => f.group)));
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {BREAKPOINTS.map((b) => (
          <button key={b.key} onClick={() => onDevice(b.key)} className={`rounded border px-2 py-0.5 ${device === b.key ? 'bg-black text-white' : ''}`} style={line}>
            {b.label}
          </button>
        ))}
      </div>
      <p style={{ color: 'var(--muted)' }}>{device === 'base' ? '桌機＝基礎樣式（其他裝置未覆寫時沿用）' : `只影響 ${BREAKPOINTS.find((b) => b.key === device)!.label}（≤${BREAKPOINTS.find((b) => b.key === device)!.maxWidth}px）；留空＝沿用桌機`}</p>
      {groups.map((g) => (
        <div key={g}>
          <div className="mb-1 font-semibold" style={{ color: 'var(--muted)' }}>
            {g}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {STYLE_FIELDS.filter((f) => f.group === g).map((f) => (
              <label key={f.key} className="block">
                <span className="block truncate" title={f.key}>
                  {f.label}
                </span>
                {f.kind === 'select' ? (
                  <select className={input} style={line} value={cur[f.key] ?? ''} onChange={(e) => onPatch(device, f.key, e.target.value)}>
                    {f.options!.map((o) => (
                      <option key={o} value={o}>
                        {o || (device !== 'base' && base[f.key] ? `（${base[f.key]}）` : '—')}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="flex gap-1">
                    {f.kind === 'color' ? <input type="color" className="h-6 w-7 shrink-0 rounded border p-0" style={line} value={/^#[0-9a-f]{6}$/i.test(cur[f.key] ?? '') ? cur[f.key]! : '#ffffff'} onChange={(e) => onPatch(device, f.key, e.target.value)} /> : null}
                    <input className={input} style={line} value={cur[f.key] ?? ''} placeholder={device !== 'base' ? base[f.key] ?? '' : ''} onChange={(e) => onPatch(device, f.key, e.target.value)} />
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PageSettings({ doc, onChange }: { doc: DesignDoc; onChange: (d: DesignDoc) => void }) {
  const s = doc.settings ?? {};
  return (
    <div className="space-y-2">
      <div className="font-semibold">頁面設定</div>
      <p style={{ color: 'var(--muted)' }}>未選取元素。從左側拖曳「物件」或「區塊模板」到畫布開始設計。</p>
      <label className="block">
        主色（按鈕 primary）
        <input className={input} style={line} value={s.accent ?? ''} placeholder="沿用網站設定主色" onChange={(e) => onChange({ ...doc, settings: { ...s, accent: e.target.value || undefined } })} />
      </label>
      <label className="block">
        字型 font-family
        <input className={input} style={line} value={s.fontFamily ?? ''} placeholder="沿用網站字型" onChange={(e) => onChange({ ...doc, settings: { ...s, fontFamily: e.target.value || undefined } })} />
      </label>
    </div>
  );
}

/* ---------- 程式碼（乾淨輸出＋JSON 直接編輯） ---------- */
function CodePanel({ doc, html, css, onApply }: { doc: DesignDoc; html: string; css: string; onApply: (d: DesignDoc) => void }) {
  const [tab, setTab] = useState<'html' | 'css' | 'json'>('json');
  const [json, setJson] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => setJson(JSON.stringify(doc, null, 2)), [doc]);
  const copy = (s: string) => navigator.clipboard?.writeText(s);
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {(['json', 'html', 'css'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded border px-2 py-0.5 ${tab === k ? 'bg-black text-white' : ''}`} style={line}>
            {k.toUpperCase()}
          </button>
        ))}
        <button onClick={() => copy(tab === 'json' ? json : tab === 'html' ? html : css)} className="ml-auto rounded border px-2 py-0.5" style={line}>
          複製
        </button>
      </div>
      {tab === 'json' ? (
        <>
          <textarea className={`${input} font-mono`} style={line} rows={22} value={json} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                try {
                  // 交給共用驗證器（與匯入相同規則）
                  onApply(parseDesignDoc(JSON.parse(json)));
                  setErr('');
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e));
                }
              }}
              className="rounded bg-black px-2 py-1 text-white"
            >
              套用 JSON
            </button>
            {err ? <span className="text-red-700">{err}</span> : <span style={{ color: 'var(--muted)' }}>可直接貼上設計 JSON（Figma／外部工具產出）</span>}
          </div>
        </>
      ) : (
        <textarea readOnly className={`${input} font-mono`} style={line} rows={22} value={tab === 'html' ? html : css} spellCheck={false} />
      )}
    </div>
  );
}

export const newDesignId = uid;

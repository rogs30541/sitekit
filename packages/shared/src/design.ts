/**
 * 頁面設計文件（Design Doc）：Elementor 式「物件」樹 → Webflow 式乾淨 HTML／CSS 輸出。
 * 純函式、零相依，api（發佈時轉成 body HTML、驗證匯入 JSON）與 web（設計器畫布、沙盒預覽）共用同一份渲染器＝所見即所得。
 *
 * - 三個斷點：base（桌機，預設）／tablet（≤1023px）／mobile（≤639px）；每個節點可各自覆寫樣式。
 * - live 模式輸出 @media；editor 模式輸出 @container（畫布縮窄即可模擬各裝置，不需 iframe）。
 * - 節點 id 只用 [a-z0-9]，輸出 class `sk-<id>`；editor 模式加 data-sk 供畫布選取／拖放。
 */
export type Breakpoint = 'base' | 'tablet' | 'mobile';
export const BREAKPOINTS: { key: Breakpoint; label: string; width: number; maxWidth?: number }[] = [
  { key: 'base', label: '桌機', width: 1200 },
  { key: 'tablet', label: '平板', width: 820, maxWidth: 1023 },
  { key: 'mobile', label: '手機', width: 390, maxWidth: 639 },
];

export type DesignStyle = Record<string, string | undefined>;
/** 區塊滑動追蹤：進入可視範圍達 percent（區塊自身可見百分比）時送自訂事件 */
export interface NodeTrack {
  event: string;
  percent: number;
  once: boolean;
  label?: string;
}
export const normalizeNodeTrack = (v: unknown): NodeTrack | undefined => {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const event = typeof o.event === 'string' ? o.event.trim() : '';
  if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(event)) return undefined;
  const percent = Math.max(1, Math.min(100, Math.round(Number(o.percent)) || 50));
  return { event, percent, once: o.once !== false, ...(typeof o.label === 'string' && o.label.trim() ? { label: o.label.trim().slice(0, 60) } : {}) };
};
export interface DesignNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
  track?: NodeTrack;
  style?: Partial<Record<Breakpoint, DesignStyle>>;
  children?: DesignNode[];
}
import { normalizeTracking, type TrackingConfig } from './tracking';
import { ICONS } from './site-templates/icons';

/** 圖示：名稱（ICON_NAMES）→ 線條 SVG；其他文字（舊 emoji）原樣輸出 */
const iconHtml = (raw: unknown, size = 32): string => {
  const s = String(raw ?? '').trim();
  const body = ICONS[s];
  if (body) return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  return escapeHtml(s);
};

export interface DesignDoc {
  version: 1;
  root: DesignNode;
  /** tracking＝頁面層級追蹤碼區塊（留空沿用網站設定；前台以 Tracking 元件注入，不進 body HTML） */
  settings?: { maxWidth?: number; fontFamily?: string; accent?: string; tracking?: TrackingConfig };
}

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

/** 可編輯的樣式屬性（設計器右欄「樣式」面板依此產生表單） */
export const STYLE_FIELDS: { key: string; label: string; kind: 'text' | 'color' | 'select'; options?: string[]; group: string }[] = [
  { key: 'display', label: '顯示', kind: 'select', options: ['', 'block', 'flex', 'grid', 'inline-block', 'none'], group: '版面' },
  { key: 'flexDirection', label: '排列方向', kind: 'select', options: ['', 'row', 'column'], group: '版面' },
  { key: 'justifyContent', label: '主軸對齊', kind: 'select', options: ['', 'flex-start', 'center', 'flex-end', 'space-between'], group: '版面' },
  { key: 'alignItems', label: '交叉軸對齊', kind: 'select', options: ['', 'flex-start', 'center', 'flex-end', 'stretch'], group: '版面' },
  { key: 'gap', label: '間距 gap', kind: 'text', group: '版面' },
  { key: 'gridTemplateColumns', label: '格線欄', kind: 'text', group: '版面' },
  { key: 'width', label: '寬', kind: 'text', group: '尺寸' },
  { key: 'maxWidth', label: '最大寬', kind: 'text', group: '尺寸' },
  { key: 'minHeight', label: '最小高', kind: 'text', group: '尺寸' },
  { key: 'height', label: '高', kind: 'text', group: '尺寸' },
  { key: 'padding', label: '內距', kind: 'text', group: '間距' },
  { key: 'margin', label: '外距', kind: 'text', group: '間距' },
  { key: 'background', label: '背景', kind: 'color', group: '外觀' },
  { key: 'color', label: '文字色', kind: 'color', group: '外觀' },
  { key: 'borderRadius', label: '圓角', kind: 'text', group: '外觀' },
  { key: 'border', label: '邊框', kind: 'text', group: '外觀' },
  { key: 'boxShadow', label: '陰影', kind: 'text', group: '外觀' },
  { key: 'opacity', label: '不透明度', kind: 'text', group: '外觀' },
  { key: 'fontSize', label: '字級', kind: 'text', group: '文字' },
  { key: 'fontWeight', label: '字重', kind: 'select', options: ['', '400', '500', '600', '700', '800'], group: '文字' },
  { key: 'lineHeight', label: '行高', kind: 'text', group: '文字' },
  { key: 'textAlign', label: '對齊', kind: 'select', options: ['', 'left', 'center', 'right'], group: '文字' },
  { key: 'letterSpacing', label: '字距', kind: 'text', group: '文字' },
];

export interface BlockDef {
  type: string;
  label: string;
  category: '版面' | '基礎' | '媒體' | '內容' | '商務';
  container?: boolean;
  desc: string;
  make: () => DesignNode;
}
const n = (type: string, props: Record<string, unknown> = {}, base: DesignStyle = {}, children?: DesignNode[]): DesignNode => ({ id: uid(), type, props, style: Object.keys(base).length ? { base } : {}, ...(children ? { children } : {}) });

export const BLOCK_DEFS: BlockDef[] = [
  { type: 'section', label: '區段', category: '版面', container: true, desc: '滿版背景＋置中內容區', make: () => n('section', { contentWidth: '1100px' }, { padding: '56px 24px' }) },
  { type: 'container', label: '容器', category: '版面', container: true, desc: '一般 div，可設 flex／grid', make: () => n('container', {}, { display: 'flex', flexDirection: 'column', gap: '16px' }) },
  { type: 'columns', label: '多欄', category: '版面', container: true, desc: '等寬欄位，手機自動單欄', make: () => n('columns', { cols: 2 }, { gap: '24px' }, [n('column', {}, { display: 'flex', flexDirection: 'column', gap: '12px' }), n('column', {}, { display: 'flex', flexDirection: 'column', gap: '12px' })]) },
  { type: 'column', label: '欄', category: '版面', container: true, desc: '多欄內的一欄', make: () => n('column', {}, { display: 'flex', flexDirection: 'column', gap: '12px' }) },
  { type: 'heading', label: '標題', category: '基礎', desc: 'H1–H4', make: () => n('heading', { level: 2, text: '標題文字' }, { fontSize: '32px', fontWeight: '700', lineHeight: '1.25' }) },
  { type: 'text', label: '文字', category: '基礎', desc: '段落', make: () => n('text', { text: '在這裡輸入段落文字。' }, { fontSize: '16px', lineHeight: '1.75' }) },
  { type: 'richtext', label: '富文本', category: '基礎', desc: 'HTML 段落（含清單／連結）', make: () => n('richtext', { html: '<p>富文本內容，可包含 <strong>粗體</strong> 與 <a href="/">連結</a>。</p>' }, { lineHeight: '1.75' }) },
  { type: 'button', label: '按鈕', category: '基礎', desc: '連結按鈕', make: () => n('button', { text: '立即開始', href: '/store', variant: 'primary', newTab: false }, { display: 'inline-block', padding: '12px 22px', borderRadius: '10px', fontWeight: '600' }) },
  { type: 'spacer', label: '留白', category: '基礎', desc: '垂直空間', make: () => n('spacer', {}, { height: '32px' }) },
  { type: 'divider', label: '分隔線', category: '基礎', desc: '水平線', make: () => n('divider', {}, { border: '0', height: '1px', background: '#e5e7eb', margin: '8px 0' }) },
  { type: 'image', label: '圖片', category: '媒體', desc: '圖片（可加連結）', make: () => n('image', { src: '', alt: '', href: '' }, { width: '100%', borderRadius: '12px' }) },
  { type: 'video', label: '影片', category: '媒體', desc: 'mp4／webm 檔案', make: () => n('video', { src: '', poster: '', controls: true, autoplay: false }, { width: '100%', borderRadius: '12px' }) },
  { type: 'embed', label: 'YouTube', category: '媒體', desc: 'YouTube／Vimeo 嵌入', make: () => n('embed', { url: '' }, { width: '100%' }) },
  { type: 'quote', label: '引言', category: '內容', desc: '引言＋出處', make: () => n('quote', { text: '這是一段引言。', cite: '— 某位客戶' }, { padding: '16px 20px', border: '0', borderRadius: '12px', background: '#f5f5f5' }) },
  { type: 'list', label: '清單', category: '內容', desc: '項目清單', make: () => n('list', { items: ['第一點', '第二點', '第三點'], ordered: false, icon: '✓' }, { lineHeight: '1.8' }) },
  { type: 'iconbox', label: '圖示卡', category: '內容', desc: '圖示＋標題＋說明', make: () => n('iconbox', { icon: '✨', title: '特色標題', text: '一句話說明這個特色。' }, { padding: '20px', borderRadius: '14px', background: '#ffffff', border: '1px solid #e5e7eb' }) },
  { type: 'card', label: '卡片', category: '內容', desc: '圖＋標題＋文＋按鈕', make: () => n('card', { image: '', title: '卡片標題', text: '卡片說明文字。', buttonText: '了解更多', href: '#' }, { borderRadius: '14px', background: '#ffffff', border: '1px solid #e5e7eb', padding: '0' }) },
  { type: 'faq', label: '問答', category: '內容', desc: '可展開的問答', make: () => n('faq', { items: [{ q: '如何購買？', a: '到商城加入購物車後結帳。' }, { q: '有退費嗎？', a: '依退款政策辦理。' }] }, {}) },
  { type: 'html', label: 'HTML', category: '內容', desc: '自訂 HTML 區塊（不可含 script）', make: () => n('html', { html: '<div>自訂 HTML</div>' }, {}) },
  { type: 'addtocart', label: '加入購物車按鈕', category: '商務', desc: '銷售頁內文用：點擊滾動到產品區塊', make: () => n('addtocart', { text: '立即選購', target: '#sk-products' }, { display: 'inline-block', padding: '14px 28px', borderRadius: '999px', fontWeight: '700', textAlign: 'center' }) },
  { type: 'products', label: '商品列表', category: '商務', desc: '自動帶入商城商品', make: () => n('products', { limit: 6, title: '精選商品' }, {}) },
  { type: 'courses', label: '課程列表', category: '商務', desc: '自動帶入課程', make: () => n('courses', { limit: 3, title: '熱門課程' }, {}) },
  { type: 'posts', label: '最新文章', category: '商務', desc: '自動帶入文章', make: () => n('posts', { limit: 3, title: '最新文章' }, {}) },
];
export const BLOCK_MAP: Record<string, BlockDef> = Object.fromEntries(BLOCK_DEFS.map((b) => [b.type, b]));
export const isContainerType = (t: string) => !!BLOCK_MAP[t]?.container || t === 'root';

/** 區塊模板（Elementor 的「區段模板」）：一鍵放入整段版面 */
export const TEMPLATES: { key: string; label: string; desc: string; make: () => DesignNode }[] = [
  {
    key: 'hero',
    label: '首屏 Hero',
    desc: '大標＋副標＋雙按鈕',
    make: () =>
      n('section', { contentWidth: '960px' }, { padding: '96px 24px', background: 'linear-gradient(135deg,#0f172a,#1e3a8a)', color: '#ffffff', textAlign: 'center' }, [
        n('heading', { level: 1, text: '用 AI 把想法變成作品' }, { fontSize: '48px', fontWeight: '800', lineHeight: '1.15' }),
        n('text', { text: '線上課程、AI 工作站與創作者商城，一站完成。' }, { fontSize: '18px', lineHeight: '1.7', opacity: '0.9', margin: '16px 0 28px' }),
        n('container', {}, { display: 'flex', justifyContent: 'center', gap: '12px' }, [n('button', { text: '瀏覽課程', href: '/courses', variant: 'primary' }, { display: 'inline-block', padding: '14px 26px', borderRadius: '12px', fontWeight: '700' }), n('button', { text: '前往商城', href: '/store', variant: 'outline' }, { display: 'inline-block', padding: '14px 26px', borderRadius: '12px', fontWeight: '700' })]),
      ]),
  },
  {
    key: 'features',
    label: '三大特色',
    desc: '標題＋三張圖示卡',
    make: () =>
      n('section', { contentWidth: '1100px' }, { padding: '64px 24px' }, [
        n('heading', { level: 2, text: '為什麼選擇我們' }, { fontSize: '32px', fontWeight: '700', textAlign: 'center', margin: '0 0 32px' }),
        n('columns', { cols: 3 }, { gap: '20px' }, [
          n('column', {}, {}, [n('iconbox', { icon: '⚡', title: '快速上手', text: '十分鐘完成第一個作品。' }, { padding: '22px', borderRadius: '14px', background: '#ffffff', border: '1px solid #e5e7eb' })]),
          n('column', {}, {}, [n('iconbox', { icon: '🎯', title: '實戰導向', text: '每堂課都有可交付的成果。' }, { padding: '22px', borderRadius: '14px', background: '#ffffff', border: '1px solid #e5e7eb' })]),
          n('column', {}, {}, [n('iconbox', { icon: '🤝', title: '社群支援', text: '課程問答與公告即時互動。' }, { padding: '22px', borderRadius: '14px', background: '#ffffff', border: '1px solid #e5e7eb' })]),
        ]),
      ]),
  },
  {
    key: 'cta',
    label: '行動呼籲 CTA',
    desc: '色塊＋標題＋按鈕',
    make: () =>
      n('section', { contentWidth: '800px' }, { padding: '56px 24px', background: '#111827', color: '#ffffff', textAlign: 'center', borderRadius: '0' }, [
        n('heading', { level: 2, text: '準備好開始了嗎？' }, { fontSize: '30px', fontWeight: '800' }),
        n('text', { text: '現在加入，立即解鎖所有 AI 工具。' }, { margin: '12px 0 24px', opacity: '0.85' }),
        n('button', { text: '免費註冊', href: '/register', variant: 'primary' }, { display: 'inline-block', padding: '14px 28px', borderRadius: '12px', fontWeight: '700' }),
      ]),
  },
  {
    key: 'pricing',
    label: '方案定價',
    desc: '三張方案卡',
    make: () =>
      n('section', { contentWidth: '1100px' }, { padding: '64px 24px', background: '#f8fafc' }, [
        n('heading', { level: 2, text: '選擇適合你的方案' }, { fontSize: '32px', fontWeight: '700', textAlign: 'center', margin: '0 0 32px' }),
        n('columns', { cols: 3 }, { gap: '20px' }, ['入門', '進階', '專業'].map((name, i) => n('column', {}, {}, [n('card', { image: '', title: `${name}方案`, text: ['基礎課程＋社群', '全部課程＋AI 工作站', '一對一輔導＋全部功能'][i], buttonText: `NT$ ${[990, 2990, 6990][i]}`, href: '/store' }, { borderRadius: '16px', background: '#ffffff', border: '1px solid #e5e7eb' })]))),
      ]),
  },
  {
    key: 'faq',
    label: '常見問題',
    desc: '標題＋問答',
    make: () => n('section', { contentWidth: '800px' }, { padding: '56px 24px' }, [n('heading', { level: 2, text: '常見問題' }, { fontSize: '30px', fontWeight: '700', margin: '0 0 20px' }), n('faq', { items: [{ q: '課程可以看多久？', a: '購買後無限期觀看。' }, { q: '可以開發票嗎？', a: '結帳時可填載具或統編。' }, { q: '有企業方案嗎？', a: '請透過聯絡方式洽談。' }] }, {})]) },
  {
    key: 'testimonials',
    label: '客戶見證',
    desc: '三則引言',
    make: () => n('section', { contentWidth: '1100px' }, { padding: '56px 24px' }, [n('heading', { level: 2, text: '學員怎麼說' }, { fontSize: '30px', fontWeight: '700', textAlign: 'center', margin: '0 0 28px' }), n('columns', { cols: 3 }, { gap: '20px' }, [1, 2, 3].map((i) => n('column', {}, {}, [n('quote', { text: `第 ${i} 則見證內容，請替換成真實回饋。`, cite: '— 學員' }, { padding: '18px 20px', borderRadius: '12px', background: '#f5f5f5' })])))]) },
  {
    key: 'gallery',
    label: '圖片牆',
    desc: '四格圖片',
    make: () => n('section', { contentWidth: '1100px' }, { padding: '48px 24px' }, [n('columns', { cols: 4 }, { gap: '12px' }, [1, 2, 3, 4].map(() => n('column', {}, {}, [n('image', { src: '', alt: '' }, { width: '100%', borderRadius: '12px' })])))]) },
  {
    key: 'store',
    label: '商品＋課程',
    desc: '自動帶入商城與課程',
    make: () => n('section', { contentWidth: '1100px' }, { padding: '56px 24px' }, [n('products', { limit: 6, title: '精選商品' }, {}), n('spacer', {}, { height: '32px' }), n('courses', { limit: 3, title: '熱門課程' }, {})]) },
  {
    key: 'contact',
    label: '聯絡資訊',
    desc: '兩欄：文字＋清單',
    make: () => n('section', { contentWidth: '1000px' }, { padding: '56px 24px' }, [n('columns', { cols: 2 }, { gap: '32px' }, [n('column', {}, {}, [n('heading', { level: 2, text: '聯絡我們' }, { fontSize: '30px', fontWeight: '700' }), n('text', { text: '有任何合作或課程問題，歡迎聯絡。' }, { lineHeight: '1.75' })]), n('column', {}, {}, [n('list', { items: ['Email：hello@example.com', 'LINE：@example', '地址：台北市'], ordered: false, icon: '•' }, { lineHeight: '2' })])])]) },
];

export const emptyDesign = (): DesignDoc => ({ version: 1, root: { id: 'root', type: 'root', props: {}, style: {}, children: [] }, settings: { maxWidth: 1200 } });

/* ---------- 樹操作（設計器用，皆回傳新物件） ---------- */
export function findNode(root: DesignNode, id: string): DesignNode | null {
  if (root.id === id) return root;
  for (const c of root.children ?? []) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}
export function findParent(root: DesignNode, id: string): { parent: DesignNode; index: number } | null {
  const kids = root.children ?? [];
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].id === id) return { parent: root, index: i };
    const f = findParent(kids[i], id);
    if (f) return f;
  }
  return null;
}
export function mapTree(node: DesignNode, fn: (n: DesignNode) => DesignNode): DesignNode {
  const next = fn(node);
  return next.children ? { ...next, children: next.children.map((c) => mapTree(c, fn)) } : next;
}
export function updateNode(root: DesignNode, id: string, patch: (n: DesignNode) => DesignNode): DesignNode {
  return mapTree(root, (x) => (x.id === id ? patch(x) : x));
}
export function removeNode(root: DesignNode, id: string): DesignNode {
  return mapTree(root, (x) => (x.children ? { ...x, children: x.children.filter((c) => c.id !== id) } : x));
}
export function insertNode(root: DesignNode, parentId: string, index: number, node: DesignNode): DesignNode {
  return updateNode(root, parentId, (p) => {
    const kids = [...(p.children ?? [])];
    kids.splice(Math.max(0, Math.min(index, kids.length)), 0, node);
    return { ...p, children: kids };
  });
}
export function moveNode(root: DesignNode, id: string, parentId: string, index: number): DesignNode {
  const node = findNode(root, id);
  if (!node || id === parentId || findNode(node, parentId)) return root;
  const from = findParent(root, id);
  const without = removeNode(root, id);
  let idx = index;
  if (from && from.parent.id === parentId && from.index < index) idx = index - 1;
  return insertNode(without, parentId, idx, node);
}
export function cloneNode(node: DesignNode): DesignNode {
  return { ...node, id: uid(), props: JSON.parse(JSON.stringify(node.props)), style: JSON.parse(JSON.stringify(node.style ?? {})), ...(node.children ? { children: node.children.map(cloneNode) } : {}) };
}
export function countNodes(node: DesignNode): number {
  return 1 + (node.children ?? []).reduce((s, c) => s + countNodes(c), 0);
}

/* ---------- 驗證／匯入 ---------- */
const ID_RE = /^[a-z0-9_-]{1,32}$/i;
export function parseDesignDoc(input: unknown): DesignDoc {
  const src = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;
  if (!src || typeof src !== 'object') throw new Error('設計文件必須是 JSON 物件');
  const d = src as Partial<DesignDoc>;
  const root = d.root ?? (Array.isArray((src as { blocks?: unknown }).blocks) ? { id: 'root', type: 'root', props: {}, children: (src as { blocks: unknown[] }).blocks } : null);
  if (!root || typeof root !== 'object') throw new Error('缺少 root 節點（或 blocks 陣列）');
  const seen = new Set<string>();
  let count = 0;
  const walk = (x: unknown, depth: number): DesignNode => {
    if (!x || typeof x !== 'object') throw new Error('節點必須是物件');
    if (depth > 20) throw new Error('節點層級過深（>20）');
    if (++count > 2000) throw new Error('節點數超過 2000');
    const o = x as Partial<DesignNode>;
    const type = String(o.type ?? '');
    if (type !== 'root' && !BLOCK_MAP[type]) throw new Error(`未知的區塊類型：${type}`);
    let id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id.toLowerCase() : uid();
    if (seen.has(id)) id = uid();
    seen.add(id);
    const style: DesignNode['style'] = {};
    for (const bp of ['base', 'tablet', 'mobile'] as Breakpoint[]) {
      const s = (o.style as Record<string, unknown> | undefined)?.[bp];
      if (s && typeof s === 'object') {
        const clean: DesignStyle = {};
        for (const [k, v] of Object.entries(s as Record<string, unknown>)) if (typeof v === 'string' && v.length <= 300 && /^[a-zA-Z]+$/.test(k) && !/expression|url\s*\(\s*['"]?\s*javascript/i.test(v)) clean[k] = v;
        style[bp] = clean;
      }
    }
    const props = o.props && typeof o.props === 'object' ? (o.props as Record<string, unknown>) : {};
    const children = Array.isArray(o.children) ? o.children.map((c) => walk(c, depth + 1)) : undefined;
    if (children && !isContainerType(type)) throw new Error(`區塊 ${type} 不可包含子節點`);
    const track = normalizeNodeTrack(o.track);
    return { id, type: type === 'root' ? 'root' : type, props, style, ...(track ? { track } : {}), ...(children ? { children } : isContainerType(type) ? { children: [] } : {}) };
  };
  const r = walk(root, 0);
  return { version: 1, root: { ...r, id: 'root', type: 'root' }, settings: { maxWidth: Number(d.settings?.maxWidth) || 1200, ...(d.settings?.fontFamily ? { fontFamily: String(d.settings.fontFamily).slice(0, 120) } : {}), ...(d.settings?.accent ? { accent: String(d.settings.accent).slice(0, 40) } : {}), ...(d.settings?.tracking ? { tracking: normalizeTracking(d.settings.tracking) } : {}) } };
}

export interface LintIssue {
  level: 'error' | 'warn';
  nodeId: string;
  type: string;
  message: string;
}
/** 發佈前檢測（測試機制）：錯誤＝阻擋發佈；警告＝確認視窗提示 */
export function lintDesign(doc: DesignDoc): LintIssue[] {
  const out: LintIssue[] = [];
  const push = (level: LintIssue['level'], node: DesignNode, message: string) => out.push({ level, nodeId: node.id, type: node.type, message });
  const walk = (node: DesignNode) => {
    const p = node.props;
    switch (node.type) {
      case 'heading':
      case 'text':
        if (!String(p.text ?? '').trim()) push('warn', node, '文字為空');
        break;
      case 'image':
        if (!String(p.src ?? '').trim()) push('error', node, '圖片沒有網址');
        else if (!String(p.alt ?? '').trim()) push('warn', node, '圖片沒有替代文字（SEO／無障礙）');
        break;
      case 'video':
        if (!String(p.src ?? '').trim()) push('error', node, '影片沒有網址');
        break;
      case 'embed':
        if (!youtubeEmbed(String(p.url ?? ''))) push('error', node, '不是可嵌入的 YouTube／Vimeo 網址');
        break;
      case 'button':
        if (!String(p.href ?? '').trim() || String(p.href) === '#') push('warn', node, '按鈕沒有連結目標');
        if (!String(p.text ?? '').trim()) push('error', node, '按鈕沒有文字');
        break;
      case 'card':
        if (String(p.href ?? '') === '#') push('warn', node, '卡片按鈕連結是 #');
        break;
      case 'html':
      case 'richtext':
        if (/<script|javascript:|on[a-z]+\s*=/i.test(String(p.html ?? ''))) push('error', node, 'HTML 含 script 或事件屬性，發佈時會被移除');
        break;
      case 'columns':
        if (!(node.children ?? []).length) push('warn', node, '多欄沒有任何欄');
        break;
    }
    for (const bp of ['base', 'tablet', 'mobile'] as Breakpoint[]) {
      const s = node.style?.[bp];
      if (s) for (const [k, v] of Object.entries(s)) if (v && /expression\(|javascript:/i.test(v)) push('error', node, `樣式 ${k} 含不允許的內容`);
    }
    (node.children ?? []).forEach(walk);
  };
  walk(doc.root);
  if (!(doc.root.children ?? []).length) out.push({ level: 'error', nodeId: 'root', type: 'root', message: '頁面沒有任何區塊' });
  return out;
}

/* ---------- 渲染 ---------- */
export const escapeHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const safeUrl = (u: unknown) => {
  const s = String(u ?? '').trim();
  return /^(https?:\/\/|\/|#|mailto:|tel:)/i.test(s) ? s : s ? '#' : '';
};
export function youtubeEmbed(url: string): string | null {
  const u = url.trim();
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}
const kebab = (k: string) => k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const cssBlock = (sel: string, style: DesignStyle | undefined) => {
  const decl = Object.entries(style ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${kebab(k)}:${v}`)
    .join(';');
  return decl ? `${sel}{${decl}}\n` : '';
};

export interface RenderOptions {
  mode?: 'live' | 'editor';
  /** 選取節點（editor 模式加 class） */
  selected?: string | null;
}

/** 基礎樣式（一律附帶，讓輸出在任何頁面都長一樣） */
export const BASE_CSS = `.sk-page{box-sizing:border-box;width:100%;overflow-x:hidden;font-family:inherit;color:inherit}
.sk-page *,.sk-page *::before,.sk-page *::after{box-sizing:border-box}
.sk-page img{display:block;max-width:100%;height:auto}
.sk-page h1,.sk-page h2,.sk-page h3,.sk-page h4,.sk-page p{margin:0}
.sk-section{width:100%}
.sk-inner{margin:0 auto;width:100%}
.sk-columns{display:grid}
.sk-btn{text-decoration:none;text-align:center;cursor:pointer;transition:opacity .15s}
.sk-btn:hover{opacity:.88}
.sk-btn-primary{background:var(--accent,#111827);color:#fff}
.sk-btn-outline{background:transparent;color:inherit;border:1.5px solid currentColor}
.sk-btn-ghost{background:rgba(127,127,127,.12);color:inherit}
.sk-list{list-style:none;padding:0;margin:0}
.sk-list li{display:flex;gap:8px;align-items:flex-start}
.sk-list.sk-ordered{list-style:decimal;padding-left:1.4em}
.sk-list.sk-ordered li{display:list-item}
.sk-iconbox .sk-icon{font-size:30px;line-height:1;margin-bottom:12px}.sk-iconbox .sk-icon svg{display:block}.sk-list .sk-li-icon svg{display:inline-block;vertical-align:-3px;margin-right:6px}
.sk-iconbox h3{font-size:18px;font-weight:700;margin-bottom:6px}
.sk-card{overflow:hidden;display:flex;flex-direction:column}
.sk-card img{width:100%;aspect-ratio:16/9;object-fit:cover}
.sk-card .sk-card-body{padding:18px;display:flex;flex-direction:column;gap:8px;flex:1}
.sk-card h3{font-size:18px;font-weight:700}
.sk-card .sk-btn{align-self:flex-start;padding:10px 16px;border-radius:10px;font-weight:600;margin-top:auto}
.sk-quote blockquote{margin:0;font-size:17px;line-height:1.7}
.sk-quote cite{display:block;margin-top:10px;font-style:normal;font-size:13px;opacity:.7}
.sk-faq details{border-bottom:1px solid #e5e7eb;padding:12px 0}
.sk-faq summary{cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between}
.sk-faq summary::after{content:'+';opacity:.5}
.sk-faq details[open] summary::after{content:'−'}
.sk-faq .sk-answer{padding-top:8px;line-height:1.7;opacity:.85}
.sk-embed{position:relative;aspect-ratio:16/9}
.sk-embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:12px}
.sk-widget{min-height:40px}
.sk-widget-title{font-size:24px;font-weight:700;margin-bottom:16px}
.sk-widget-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.sk-widget-grid a{display:block;border:1px solid #e5e7eb;border-radius:12px;padding:14px;text-decoration:none;color:inherit;background:#fff}
.sk-widget-grid a:hover{box-shadow:0 4px 16px rgba(0,0,0,.06)}
.sk-widget-grid .sk-w-title{font-weight:700}
.sk-widget-grid .sk-w-sub{font-size:13px;opacity:.7;margin-top:4px}
.sk-widget-grid img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;margin-bottom:10px}
.sk-widget-empty{opacity:.6;font-size:14px}
@media (max-width:1023px){.sk-columns{grid-template-columns:repeat(2,minmax(0,1fr))!important}.sk-widget-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:639px){.sk-columns{grid-template-columns:1fr!important}.sk-widget-grid{grid-template-columns:1fr}}
`;
const EDITOR_BASE_CSS = BASE_CSS.replace(/@media \(max-width:(\d+)px\)/g, '@container sk (max-width:$1px)') + `
.sk-editor{container-type:inline-size;container-name:sk}
.sk-editor [data-sk]{position:relative;min-height:8px}
.sk-editor [data-sk]:hover{outline:1px dashed rgba(59,130,246,.6);outline-offset:-1px}
.sk-editor .sk-selected{outline:2px solid #3b82f6!important;outline-offset:-2px}
.sk-editor .sk-empty-container{min-height:56px;border:1px dashed #cbd5e1;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:12px}
.sk-editor .sk-drop-before{box-shadow:inset 0 3px 0 #3b82f6}
.sk-editor .sk-drop-after{box-shadow:inset 0 -3px 0 #3b82f6}
.sk-editor .sk-drop-inside{box-shadow:inset 0 0 0 3px #3b82f6}
.sk-editor .sk-ph{background:repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 8px,#e2e8f0 8px,#e2e8f0 16px);color:#64748b;display:flex;align-items:center;justify-content:center;font-size:13px;min-height:120px;border-radius:12px}
`;

export function renderDesign(doc: DesignDoc, opts: RenderOptions = {}): { html: string; css: string } {
  const editor = opts.mode === 'editor';
  const mq = (bp: Breakpoint) => {
    const w = BREAKPOINTS.find((b) => b.key === bp)?.maxWidth;
    return editor ? `@container sk (max-width:${w}px)` : `@media (max-width:${w}px)`;
  };
  let css = '';
  const tablet: string[] = [];
  const mobile: string[] = [];
  const walkCss = (node: DesignNode) => {
    const sel = `.sk-${node.id}`;
    const extra: DesignStyle = {};
    if (node.type === 'columns') extra.gridTemplateColumns = `repeat(${Math.max(1, Math.min(6, Number(node.props.cols) || 2))},minmax(0,1fr))`;
    if (node.type === 'section') css += cssBlock(`${sel}>.sk-inner`, { maxWidth: String(node.props.contentWidth || '1100px') });
    css += cssBlock(sel, { ...extra, ...(node.style?.base ?? {}) });
    const t = cssBlock(sel, node.style?.tablet);
    if (t) tablet.push(t);
    const m = cssBlock(sel, node.style?.mobile);
    if (m) mobile.push(m);
    (node.children ?? []).forEach(walkCss);
  };
  walkCss(doc.root);
  if (tablet.length) css += `${mq('tablet')}{${tablet.join('')}}\n`;
  if (mobile.length) css += `${mq('mobile')}{${mobile.join('')}}\n`;
  if (doc.settings?.accent) css = `.sk-page{--accent:${doc.settings.accent}}\n` + css;
  if (doc.settings?.fontFamily) css = `.sk-page{font-family:${doc.settings.fontFamily}}\n` + css;

  const trackAttr = (node: DesignNode) => (node.track ? ` data-sk-track="${escapeHtml(node.track.event)}" data-sk-track-percent="${node.track.percent}" data-sk-track-once="${node.track.once ? '1' : '0'}"${node.track.label ? ` data-sk-track-label="${escapeHtml(node.track.label)}"` : ''}` : '');
  const attr = (node: DesignNode, cls = '') => `class="sk-${node.id}${cls ? ' ' + cls : ''}${editor && opts.selected === node.id ? ' sk-selected' : ''}"${editor ? ` data-sk="${node.id}" data-sk-type="${node.type}"` : ''}${trackAttr(node)}`;
  const kids = (node: DesignNode) => {
    const inner = (node.children ?? []).map(render).join('');
    if (editor && !inner && isContainerType(node.type)) return `<div class="sk-empty-container">拖曳物件到這裡（${BLOCK_MAP[node.type]?.label ?? node.type}）</div>`;
    return inner;
  };
  const render = (node: DesignNode): string => {
    const p = node.props;
    switch (node.type) {
      case 'root':
        return kids(node);
      case 'section':
        return `<section ${attr(node, 'sk-section')}><div class="sk-inner">${kids(node)}</div></section>`;
      case 'container':
      case 'column':
        return `<div ${attr(node, node.type === 'column' ? 'sk-column' : 'sk-container')}>${kids(node)}</div>`;
      case 'columns':
        return `<div ${attr(node, 'sk-columns')}>${kids(node)}</div>`;
      case 'heading': {
        const lv = Math.max(1, Math.min(4, Number(p.level) || 2));
        return `<h${lv} ${attr(node)}>${escapeHtml(p.text)}</h${lv}>`;
      }
      case 'text':
        return `<p ${attr(node)}>${escapeHtml(p.text).replace(/\n/g, '<br>')}</p>`;
      case 'richtext':
        return `<div ${attr(node, 'prose')}>${String(p.html ?? '')}</div>`;
      case 'html':
        return `<div ${attr(node)}>${String(p.html ?? '')}</div>`;
      case 'button': {
        const v = ['primary', 'outline', 'ghost'].includes(String(p.variant)) ? String(p.variant) : 'primary';
        return `<a ${attr(node, `sk-btn sk-btn-${v}`)} href="${escapeHtml(safeUrl(p.href) || '#')}"${p.newTab ? ' target="_blank" rel="noopener"' : ''}>${escapeHtml(p.text)}</a>`;
      }
      case 'addtocart':
        return `<div class="sk-atc-wrap" style="text-align:center"><a ${attr(node, 'sk-btn sk-btn-primary sk-addtocart')} href="${escapeHtml(safeUrl(p.target) || '#sk-products')}">${escapeHtml(p.text || '立即選購')}</a></div>`;
      case 'spacer':
        return `<div ${attr(node, 'sk-spacer')}></div>`;
      case 'divider':
        return `<hr ${attr(node, 'sk-divider')}>`;
      case 'image': {
        const src = safeUrl(p.src);
        const img = src ? `<img ${attr(node)} src="${escapeHtml(src)}" alt="${escapeHtml(p.alt)}" loading="lazy">` : editor ? `<div ${attr(node, 'sk-ph')}>圖片（尚未設定網址）</div>` : '';
        const href = safeUrl(p.href);
        return href && src ? `<a href="${escapeHtml(href)}">${img}</a>` : img;
      }
      case 'video': {
        const src = safeUrl(p.src);
        if (!src) return editor ? `<div ${attr(node, 'sk-ph')}>影片（尚未設定網址）</div>` : '';
        return `<video ${attr(node)} src="${escapeHtml(src)}"${p.poster ? ` poster="${escapeHtml(safeUrl(p.poster))}"` : ''}${p.controls === false ? '' : ' controls'}${p.autoplay ? ' autoplay muted loop playsinline' : ''}></video>`;
      }
      case 'embed': {
        const e = youtubeEmbed(String(p.url ?? ''));
        if (!e) return editor ? `<div ${attr(node, 'sk-ph')}>YouTube／Vimeo（尚未設定網址）</div>` : '';
        return `<div ${attr(node, 'sk-embed')}><iframe src="${escapeHtml(e)}" title="video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
      }
      case 'quote':
        return `<div ${attr(node, 'sk-quote')}><blockquote>${escapeHtml(p.text)}</blockquote>${p.cite ? `<cite>${escapeHtml(p.cite)}</cite>` : ''}</div>`;
      case 'list': {
        const items = Array.isArray(p.items) ? (p.items as unknown[]).map(String) : [];
        const ordered = !!p.ordered;
        const icon = ordered ? '' : iconHtml(p.icon ?? '•', 18);
        return `<${ordered ? 'ol' : 'ul'} ${attr(node, `sk-list${ordered ? ' sk-ordered' : ''}`)}>${items.map((it) => `<li>${icon ? `<span class="sk-li-icon">${icon}</span>` : ''}<span>${escapeHtml(it)}</span></li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
      }
      case 'iconbox':
        return `<div ${attr(node, 'sk-iconbox')}><div class="sk-icon">${iconHtml(p.icon)}</div><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.text)}</p></div>`;
      case 'card': {
        const img = safeUrl(p.image);
        const href = safeUrl(p.href);
        return `<div ${attr(node, 'sk-card')}>${img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy">` : ''}<div class="sk-card-body"><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.text)}</p>${p.buttonText ? `<a class="sk-btn sk-btn-primary" href="${escapeHtml(href || '#')}">${escapeHtml(p.buttonText)}</a>` : ''}</div></div>`;
      }
      case 'faq': {
        const items = Array.isArray(p.items) ? (p.items as { q?: unknown; a?: unknown }[]) : [];
        return `<div ${attr(node, 'sk-faq')}>${items.map((it) => `<details><summary>${escapeHtml(it.q)}</summary><div class="sk-answer">${escapeHtml(it.a)}</div></details>`).join('')}</div>`;
      }
      case 'products':
      case 'courses':
      case 'posts': {
        const limit = Math.max(1, Math.min(24, Number(p.limit) || 6));
        const title = p.title ? `<div class="sk-widget-title">${escapeHtml(p.title)}</div>` : '';
        const ph = editor ? `<div class="sk-ph">${BLOCK_MAP[node.type].label}（前台自動帶入 ${limit} 筆）</div>` : `<div class="sk-widget-empty">載入中…</div>`;
        return `<div ${attr(node, 'sk-widget')} data-widget="${node.type}" data-limit="${limit}">${title}<div class="sk-widget-body">${ph}</div></div>`;
      }
      default:
        return editor ? `<div ${attr(node, 'sk-ph')}>未知區塊 ${escapeHtml(node.type)}</div>` : '';
    }
  };
  const html = `<div class="sk-page${editor ? ' sk-editor' : ''}">${render(doc.root)}</div>`;
  return { html, css: (editor ? EDITOR_BASE_CSS : BASE_CSS) + css };
}

/** 發佈用：完整 body HTML（style＋內容），前台頁面直接 innerHTML；為 Webflow 式乾淨輸出。 */
export function renderDesignDocument(doc: DesignDoc): string {
  const { html, css } = renderDesign(doc, { mode: 'live' });
  return `<style>${css}</style>\n${html}`;
}

/** 從既有 HTML body 建立設計文件（傳統編輯器內容 → 一個 richtext 區塊，方便轉用設計器） */
export function designFromHtml(html: string): DesignDoc {
  const d = emptyDesign();
  d.root.children = [n('section', { contentWidth: '860px' }, { padding: '40px 24px' }, [n('richtext', { html }, { lineHeight: '1.75' })])];
  return d;
}

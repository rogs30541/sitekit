'use client';

import { useEffect, useState } from 'react';
import { ICON_NAMES, SECTION_KIND_LABELS, type SectionInput, type SectionKind } from '@sitekit/shared';
import { Icon } from '@/components/Icon';
import { uploadImage, UPLOAD_LIMIT_LABEL } from '@/lib/upload-image';

/**
 * 區塊編輯器（首頁版面與區塊頁共用；與套版同一套 20 種 kind）：
 * 每個區塊＝版式／底色／緊湊／錨點 id ＋ 文字欄位 ＋ 清單欄位（逐列表單，非 JSON）＋ 圖片欄位可上傳 ＋ 圖示用名稱挑選。
 * 只產出資料（value／onChange），儲存由外層決定（首頁：PUT /api/admin/site/home；頁面：草稿 design）。
 */
export type S = SectionInput & Record<string, unknown>;
type Col = [key: string, label: string, type?: 'text' | 'area' | 'image' | 'icon' | 'url' | 'bool' | 'list'];

const VARIANTS: Partial<Record<SectionKind, string[]>> = {
  hero: ['center', 'left', 'split', 'cover', 'editorial', 'dashboard', 'carousel'],
  stats: ['row', 'cards', 'inline'],
  features: ['grid', 'list', 'icons', 'tabs', 'numbered'],
  gallery: ['grid', 'masonry', 'strip', 'logos'],
  testimonials: ['cards', 'quotes', 'wall', 'single'],
  steps: ['numbers', 'timeline', 'cards'],
  team: ['grid', 'list', 'founder'],
  cta: ['band', 'card', 'split'],
  contact: ['cards', 'columns', 'map'],
  categories: ['tiles', 'chips', 'icons'],
  courses: ['grid', 'list', 'ranking', 'featured', 'progress', 'strip'],
  products: ['grid', 'list', 'ranking', 'featured', 'strip'],
  posts: ['grid', 'list', 'featured', 'strip'],
};
const VARIANT_LABEL: Record<string, string> = { center: '置中', left: '靠左', split: '左右分欄', cover: '滿版大標', editorial: '編輯風', dashboard: '儀表板', carousel: '輪播', row: '一列', cards: '卡片', inline: '行內', grid: '格狀', list: '清單', icons: '圖示', tabs: '頁籤', numbered: '編號', masonry: '瀑布', strip: '橫向捲動', logos: 'Logo 列', quotes: '引言', wall: '牆', single: '單則', numbers: '數字', timeline: '時間軸', founder: '創辦人', band: '色帶', card: '卡片', columns: '欄', map: '地圖', tiles: '圖磚', chips: '標籤', ranking: '排行', featured: '精選', progress: '募資進度' };
const TONES: [string, string][] = [['default', '一般'], ['muted', '淺灰'], ['accent', '主色'], ['dark', '深色'], ['image', '背景圖']];

/** 各 kind 的欄位定義（純文字／多行／圖片／影片／連結） */
const FIELDS: Record<SectionKind, Col[]> = {
  hero: [['kicker', '小標'], ['title', '標題'], ['subtitle', '副標', 'area'], ['ctaText', '按鈕文字'], ['ctaHref', '按鈕連結', 'url'], ['cta2Text', '第二按鈕文字'], ['cta2Href', '第二按鈕連結', 'url'], ['imageUrl', '圖片', 'image'], ['videoUrl', '影片網址（YouTube／mp4）', 'url']],
  banner: [['text', '文字'], ['href', '連結', 'url']],
  stats: [['kicker', '小標'], ['title', '標題'], ['subtitle', '副標']],
  features: [['kicker', '小標'], ['title', '標題'], ['subtitle', '副標']],
  split: [['kicker', '小標'], ['title', '標題'], ['subtitle', '副標'], ['text', '內文', 'area'], ['imageUrl', '圖片', 'image'], ['videoUrl', '影片網址', 'url'], ['ctaText', '按鈕文字'], ['ctaHref', '按鈕連結', 'url'], ['cta2Text', '第二按鈕文字'], ['cta2Href', '第二按鈕連結', 'url'], ['sticky', '圖片跟隨捲動', 'bool']],
  gallery: [['title', '標題'], ['subtitle', '副標']],
  testimonials: [['kicker', '小標'], ['title', '標題'], ['subtitle', '副標']],
  faq: [['title', '標題'], ['subtitle', '副標']],
  pricing: [['title', '標題'], ['subtitle', '副標']],
  steps: [['kicker', '小標'], ['title', '標題'], ['subtitle', '副標']],
  team: [['title', '標題'], ['subtitle', '副標']],
  logos: [['title', '標題']],
  video: [['title', '標題'], ['videoUrl', '影片網址（YouTube／mp4）', 'url'], ['text', '說明', 'area']],
  cta: [['title', '標題'], ['text', '說明', 'area'], ['buttonText', '按鈕文字'], ['buttonHref', '按鈕連結', 'url']],
  contact: [['title', '標題'], ['subtitle', '副標'], ['mapEmbedUrl', '地圖嵌入網址（Google Maps embed）', 'url'], ['showForm', '顯示聯絡表單（訊息進後台「表單訊息」）', 'bool']],
  categories: [['title', '標題'], ['subtitle', '副標']],
  courses: [['title', '標題'], ['subtitle', '副標'], ['ctaText', '「看全部」文字'], ['ctaHref', '「看全部」連結', 'url']],
  products: [['title', '標題'], ['subtitle', '副標'], ['ctaText', '「看全部」文字'], ['ctaHref', '「看全部」連結', 'url']],
  posts: [['title', '標題'], ['subtitle', '副標'], ['ctaText', '「看全部」文字'], ['ctaHref', '「看全部」連結', 'url']],
  html: [['title', '標題（可空）'], ['html', 'HTML', 'area']],
};
/** 清單欄位：key、標題、每列欄位 */
const LISTS: Partial<Record<SectionKind, { key: string; label: string; cols: Col[]; max: number; make: () => Record<string, unknown> }[]>> = {
  hero: [
    { key: 'highlights', label: '亮點（最多 4）', max: 4, cols: [['icon', '圖示', 'icon'], ['title', '標題'], ['text', '說明']], make: () => ({ icon: 'check-circle', title: '亮點', text: '' }) },
    { key: 'slides', label: '輪播頁（carousel 版式用，最多 8）', max: 8, cols: [['title', '標題'], ['subtitle', '副標'], ['imageUrl', '圖片', 'image'], ['ctaText', '按鈕文字'], ['ctaHref', '按鈕連結', 'url']], make: () => ({ title: '標題', subtitle: '', imageUrl: '', ctaText: '', ctaHref: '' }) },
  ],
  stats: [{ key: 'items', label: '數字（1–8）', max: 8, cols: [['value', '數值'], ['label', '標籤'], ['note', '註']], make: () => ({ value: '100+', label: '項目', note: '' }) }],
  features: [{ key: 'items', label: '項目（最多 16）', max: 16, cols: [['icon', '圖示', 'icon'], ['code', '編號／代碼'], ['tag', '標籤'], ['title', '標題'], ['text', '說明', 'area'], ['href', '連結', 'url'], ['ctaText', '連結文字']], make: () => ({ icon: 'sparkles', title: '項目', text: '' }) }],
  split: [{ key: 'bullets', label: '條列（最多 8）', max: 8, cols: [['_', '文字']], make: () => ({ _: '重點' }) }],
  gallery: [{ key: 'items', label: '圖片（最多 36）', max: 36, cols: [['imageUrl', '圖片', 'image'], ['caption', '說明'], ['href', '連結', 'url']], make: () => ({ imageUrl: '', caption: '', href: '' }) }],
  testimonials: [{ key: 'items', label: '見證（最多 12）', max: 12, cols: [['quote', '內容', 'area'], ['name', '姓名'], ['role', '身分'], ['avatarUrl', '頭像', 'image'], ['metric', '成果數字']], make: () => ({ quote: '', name: '', role: '' }) }],
  faq: [{ key: 'items', label: '問答（最多 20）', max: 20, cols: [['q', '問題'], ['a', '回答', 'area']], make: () => ({ q: '', a: '' }) }],
  pricing: [{ key: 'plans', label: '方案（1–4）', max: 4, cols: [['name', '名稱'], ['price', '價格'], ['period', '週期'], ['note', '註'], ['features', '內容（每行一項）', 'list'], ['ctaText', '按鈕文字'], ['ctaHref', '按鈕連結', 'url'], ['highlight', '推薦', 'bool']], make: () => ({ name: '方案', price: 'NT$ 0', period: '', features: [], ctaText: '選擇', ctaHref: '/store', highlight: false }) }],
  steps: [{ key: 'items', label: '步驟（1–10）', max: 10, cols: [['title', '標題'], ['text', '說明']], make: () => ({ title: '步驟', text: '' }) }],
  team: [{ key: 'members', label: '成員（最多 12）', max: 12, cols: [['name', '姓名'], ['role', '職稱'], ['bio', '簡介', 'area'], ['avatarUrl', '照片', 'image']], make: () => ({ name: '', role: '', bio: '' }) }],
  logos: [{ key: 'items', label: '品牌（最多 16）', max: 16, cols: [['name', '名稱'], ['imageUrl', 'Logo', 'image']], make: () => ({ name: '', imageUrl: '' }) }],
  contact: [{ key: 'items', label: '聯絡方式（最多 6）', max: 6, cols: [['icon', '圖示', 'icon'], ['label', '標籤'], ['value', '內容'], ['href', '連結（mailto:／tel:／網址）', 'url']], make: () => ({ icon: 'mail', label: 'Email', value: '', href: '' }) }],
  categories: [{ key: 'items', label: '分類（最多 16）', max: 16, cols: [['icon', '圖示', 'icon'], ['title', '名稱'], ['href', '連結', 'url'], ['count', '數量'], ['imageUrl', '圖片', 'image']], make: () => ({ icon: 'sparkles', title: '分類', href: '/store' }) }],
};
const NUMS: Partial<Record<SectionKind, [string, string, number, number][]>> = {
  features: [['columns', '欄數', 1, 4]],
  gallery: [['columns', '欄數', 2, 6]],
  categories: [['columns', '欄數', 1, 4]],
  courses: [['columns', '欄數', 1, 4], ['limit', '顯示數量', 1, 24]],
  products: [['columns', '欄數', 1, 4], ['limit', '顯示數量', 1, 24]],
  posts: [['columns', '欄數', 1, 4], ['limit', '顯示數量', 1, 24]],
};
export const SECTION_PRESETS: Record<SectionKind, () => S> = {
  hero: () => ({ kind: 'hero', variant: 'center', title: '歡迎來到我們的網站', subtitle: '一句話說明你提供的價值', ctaText: '看課程', ctaHref: '/courses' }),
  banner: () => ({ kind: 'banner', text: '新品上市｜全站免運', href: '/store', tone: 'accent' }),
  stats: () => ({ kind: 'stats', items: [{ value: '1,000+', label: '學員' }, { value: '98%', label: '滿意度' }, { value: '12', label: '年經驗' }] }),
  features: () => ({ kind: 'features', title: '為什麼選我們', columns: 3, items: [{ title: '特色一', text: '', icon: 'sparkles' }, { title: '特色二', text: '', icon: 'rocket' }, { title: '特色三', text: '', icon: 'lightbulb' }] }),
  split: () => ({ kind: 'split', title: '關於我們', text: '在這裡介紹你的故事。', bullets: ['重點一', '重點二'], imageUrl: '' }),
  gallery: () => ({ kind: 'gallery', title: '作品集', columns: 3, items: [] }),
  testimonials: () => ({ kind: 'testimonials', title: '學員回饋', items: [{ quote: '很實用，馬上就能用在工作上。', name: '王小明', role: '行銷企劃' }] }),
  faq: () => ({ kind: 'faq', title: '常見問題', items: [{ q: '如何購買？', a: '到商城選擇商品後結帳即可。' }] }),
  pricing: () => ({ kind: 'pricing', title: '方案價格', plans: [{ name: '基本', price: 'NT$ 990', period: '/月', features: ['功能一', '功能二'], ctaText: '選擇', ctaHref: '/store' }] }),
  steps: () => ({ kind: 'steps', title: '如何開始', items: [{ title: '註冊', text: '' }, { title: '選課', text: '' }, { title: '開始學習', text: '' }] }),
  team: () => ({ kind: 'team', title: '團隊', members: [{ name: '創辦人', role: '執行長', bio: '' }] }),
  logos: () => ({ kind: 'logos', title: '合作夥伴', items: [{ name: 'Partner A' }, { name: 'Partner B' }] }),
  video: () => ({ kind: 'video', title: '品牌影片', videoUrl: 'https://www.youtube.com/watch?v=' }),
  cta: () => ({ kind: 'cta', variant: 'band', title: '準備好開始了嗎？', text: '', buttonText: '立即加入', buttonHref: '/register' }),
  contact: () => ({ kind: 'contact', title: '聯絡我們', showForm: true, items: [{ icon: 'mail', label: 'Email', value: 'hello@example.com', href: 'mailto:hello@example.com' }] }),
  categories: () => ({ kind: 'categories', title: '分類', columns: 4, items: [{ icon: 'shopping-bag', title: '分類一', href: '/store' }, { icon: 'star', title: '分類二', href: '/store' }] }),
  courses: () => ({ kind: 'courses', title: '精選課程', limit: 3, columns: 3 }),
  products: () => ({ kind: 'products', title: '熱門商品', limit: 4, columns: 4 }),
  posts: () => ({ kind: 'posts', title: '最新文章', limit: 3, columns: 3 }),
  html: () => ({ kind: 'html', title: '', html: '<p>自訂內容</p>' }),
};
export const SECTION_KINDS = Object.keys(SECTION_PRESETS) as SectionKind[];
const input = 'w-full rounded border px-2 py-1 text-sm';
const line = { borderColor: 'var(--line)' } as const;

/** 圖片欄：網址＋上傳 */
function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [err, setErr] = useState('');
  return (
    <span className="flex items-center gap-1">
      {value ? <img src={value} alt="" className="h-8 w-8 shrink-0 rounded object-cover" /> : null}
      <input className={input} style={line} value={value} placeholder="貼上圖片網址，或上傳" onChange={(e) => onChange(e.target.value)} />
      <label className="shrink-0 cursor-pointer rounded border px-2 py-1 text-xs" style={line} title={`上傳圖片（≤${UPLOAD_LIMIT_LABEL}）`}>
        上傳
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              onChange(await uploadImage(f));
              setErr('');
            } catch (er) {
              setErr(er instanceof Error ? er.message : String(er));
            }
          }}
        />
      </label>
      {err ? <span className="text-xs text-red-700">{err}</span> : null}
    </span>
  );
}
/** 圖示欄：名稱（datalist 挑選）＋即時預覽 */
function IconField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="flex items-center gap-1">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border" style={line}>
        <Icon name={ICON_NAMES.includes(value) ? value : 'sparkles'} size={16} />
      </span>
      <input className={input} style={line} list="sk-icon-names" value={value} placeholder="圖示名稱（例 mail、phone、star）" onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

function Field({ col, value, onChange }: { col: Col; value: unknown; onChange: (v: unknown) => void }) {
  const [, label, type = 'text'] = col;
  if (type === 'bool')
    return (
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {label}
      </label>
    );
  return (
    <label className={`block text-xs ${type === 'area' || type === 'list' ? 'sm:col-span-2' : ''}`}>
      {label}
      {type === 'area' ? (
        <textarea className={input} style={line} rows={3} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
      ) : type === 'list' ? (
        <textarea className={input} style={line} rows={3} value={Array.isArray(value) ? (value as string[]).join('\n') : ''} onChange={(e) => onChange(e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} />
      ) : type === 'image' ? (
        <ImageField value={String(value ?? '')} onChange={onChange} />
      ) : type === 'icon' ? (
        <IconField value={String(value ?? '')} onChange={onChange} />
      ) : (
        <input className={input} style={line} value={String(value ?? '')} placeholder={type === 'url' ? '/courses、/p/about、#faq 或 https://…' : ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

export function SectionsEditor({ value, onChange }: { value: SectionInput[]; onChange: (v: SectionInput[]) => void }) {
  const sections = value as S[];
  const [add, setAdd] = useState<SectionKind>('hero');
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [json, setJson] = useState<number | null>(null);
  useEffect(() => {
    if (!document.getElementById('sk-icon-names')) {
      const dl = document.createElement('datalist');
      dl.id = 'sk-icon-names';
      dl.innerHTML = ICON_NAMES.map((n) => `<option value="${n}">`).join('');
      document.body.appendChild(dl);
    }
  }, []);
  const set = (next: S[]) => onChange(next);
  const upd = (i: number, patch: Record<string, unknown>) => set(sections.map((x, k) => (k === i ? ({ ...x, ...patch } as S) : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= sections.length) return;
    const c = [...sections];
    [c[i], c[j]] = [c[j], c[i]];
    set(c);
  };
  const dup = (i: number) => set([...sections.slice(0, i + 1), JSON.parse(JSON.stringify(sections[i])), ...sections.slice(i + 1)]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={add} onChange={(e) => setAdd(e.target.value as SectionKind)} className="rounded border px-2 py-1" style={line}>
          {SECTION_KINDS.map((k) => (
            <option key={k} value={k}>
              {SECTION_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => set([...sections, SECTION_PRESETS[add]()])} className="rounded border px-3 py-1" style={line}>
          ＋ 新增區塊
        </button>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>共 {sections.length} 個區塊（上限 40）</span>
      </div>
      {!sections.length ? (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          尚無區塊。可從上方新增，或到「套版庫」一鍵套用整套版型。
        </p>
      ) : null}
      <ol className="space-y-2">
        {sections.map((s, i) => {
          const kind = s.kind as SectionKind;
          const isOpen = open[i] ?? false;
          const title = String(s.title ?? s.text ?? '') || '';
          return (
            <li key={i} className="rounded-lg border" style={line} data-section={kind}>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                <button type="button" onClick={() => setOpen({ ...open, [i]: !isOpen })} className="font-semibold">
                  {isOpen ? '▾' : '▸'} {i + 1}. {SECTION_KIND_LABELS[kind] ?? kind}
                  {title ? <span className="ml-2 font-normal" style={{ color: 'var(--muted)' }}>{title.slice(0, 30)}</span> : null}
                </button>
                {VARIANTS[kind] ? (
                  <select className="rounded border px-1 py-0.5" style={line} value={String(s.variant ?? VARIANTS[kind]![0])} onChange={(e) => upd(i, { variant: e.target.value })}>
                    {VARIANTS[kind]!.map((v) => (
                      <option key={v} value={v}>
                        版式：{VARIANT_LABEL[v] ?? v}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select className="rounded border px-1 py-0.5" style={line} value={String(s.tone ?? 'default')} onChange={(e) => upd(i, { tone: e.target.value })}>
                  {TONES.map(([v, l]) => (
                    <option key={v} value={v}>
                      底色：{l}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={!!s.compact} onChange={(e) => upd(i, { compact: e.target.checked })} /> 緊湊
                </label>
                <span className="flex-1" />
                <button type="button" onClick={() => move(i, -1)} className="rounded border px-2" style={line} title="上移">
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} className="rounded border px-2" style={line} title="下移">
                  ↓
                </button>
                <button type="button" onClick={() => dup(i)} className="rounded border px-2" style={line} title="複製">
                  複製
                </button>
                <button type="button" onClick={() => setJson(json === i ? null : i)} className="rounded border px-2" style={line} title="進階 JSON">
                  JSON
                </button>
                <button type="button" onClick={() => set(sections.filter((_, k) => k !== i))} className="text-red-700 underline">
                  刪除
                </button>
              </div>
              {json === i ? (
                <div className="px-3 pb-3">
                  <JsonEditor value={s} onChange={(v) => set(sections.map((x, k) => (k === i ? (v as S) : x)))} />
                </div>
              ) : isOpen ? (
                <div className="space-y-3 border-t px-3 py-3" style={line}>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {FIELDS[kind]?.map((col) => (
                      <Field key={col[0]} col={col} value={s[col[0]]} onChange={(v) => upd(i, { [col[0]]: v })} />
                    ))}
                    {NUMS[kind]?.map(([k, label, min, max]) => (
                      <label key={k} className="block text-xs">
                        {label}
                        <input className={input} style={line} type="number" min={min} max={max} value={Number(s[k] ?? min)} onChange={(e) => upd(i, { [k]: Number(e.target.value) || min })} />
                      </label>
                    ))}
                    {kind === 'split' || kind === 'hero' ? (
                      <label className="block text-xs">
                        圖片位置
                        <select className={input} style={line} value={String(s.imageSide ?? 'right')} onChange={(e) => upd(i, { imageSide: e.target.value })}>
                          <option value="right">右</option>
                          <option value="left">左</option>
                        </select>
                      </label>
                    ) : null}
                    {s.tone === 'image' ? <Field col={['bgImageUrl', '背景圖', 'image']} value={s.bgImageUrl} onChange={(v) => upd(i, { bgImageUrl: v })} /> : null}
                    <label className="block text-xs">
                      錨點 id（選單可連到 /#id）
                      <input className={input} style={line} value={String(s.id ?? '')} placeholder="例 pricing、faq" onChange={(e) => upd(i, { id: e.target.value.replace(/[^a-z0-9-]/gi, '').toLowerCase() })} />
                    </label>
                  </div>
                  {LISTS[kind]?.map((L) => {
                    const raw = s[L.key];
                    const rows: Record<string, unknown>[] = Array.isArray(raw) ? (raw as unknown[]).map((r) => (typeof r === 'string' ? { _: r } : (r as Record<string, unknown>))) : [];
                    const isPlain = L.cols.length === 1 && L.cols[0][0] === '_';
                    const commit = (next: Record<string, unknown>[]) => upd(i, { [L.key]: isPlain ? next.map((r) => String(r._ ?? '')) : next });
                    return (
                      <div key={L.key} className="rounded border p-2" style={line}>
                        <div className="mb-2 flex items-center justify-between text-xs">
                          <span className="font-semibold">
                            {L.label}（{rows.length}）
                          </span>
                          <button type="button" disabled={rows.length >= L.max} className="rounded border px-2 py-0.5 disabled:opacity-40" style={line} onClick={() => commit([...rows, L.make()])}>
                            ＋ 加一列
                          </button>
                        </div>
                        <ol className="space-y-2">
                          {rows.map((r, k) => (
                            <li key={k} className="rounded border p-2" style={{ ...line, background: 'var(--soft)' }}>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {L.cols.map((col) => (
                                  <Field key={col[0]} col={col} value={r[col[0]]} onChange={(v) => commit(rows.map((x, m) => (m === k ? { ...x, [col[0]]: v } : x)))} />
                                ))}
                              </div>
                              <div className="mt-1 flex gap-2 text-xs">
                                <button type="button" onClick={() => k > 0 && commit(rows.map((x, m, a) => (m === k - 1 ? a[k] : m === k ? a[k - 1] : x)))} className="underline">
                                  上移
                                </button>
                                <button type="button" onClick={() => k < rows.length - 1 && commit(rows.map((x, m, a) => (m === k + 1 ? a[k] : m === k ? a[k + 1] : x)))} className="underline">
                                  下移
                                </button>
                                <button type="button" onClick={() => commit(rows.filter((_, m) => m !== k))} className="text-red-700 underline">
                                  刪除
                                </button>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function JsonEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(JSON.stringify(value, null, 1));
  const [err, setErr] = useState('');
  return (
    <label className="block text-xs">
      進階：整個區塊的 JSON（伺服器儲存時會再驗證）
      {err ? <span className="ml-2 text-red-700">{err}</span> : null}
      <textarea
        className={`${input} font-mono`}
        style={line}
        rows={Math.min(20, Math.max(4, text.split('\n').length))}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setErr('');
          } catch {
            setErr('JSON 格式錯誤');
          }
        }}
      />
    </label>
  );
}

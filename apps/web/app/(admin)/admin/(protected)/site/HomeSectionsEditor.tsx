'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SECTION_KIND_LABELS, type SectionInput, type SectionKind } from '@sitekit/shared';

/**
 * 首頁版面區塊編輯器：與套版共用 20 種 kind（packages/shared/site-templates/sections.ts）。
 * 文字欄位逐欄編輯；清單型欄位（items／plans／members／slides／bullets…）以 JSON 編輯（伺服器 zod 驗證會擋錯）。
 * 整組 PUT /api/admin/site/home。
 */
type S = SectionInput & Record<string, unknown>;

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
const TONES = ['default', 'muted', 'accent', 'dark', 'image'];
/** 各 kind 的純文字欄位（label 顯示用） */
const TEXT_FIELDS: Record<SectionKind, [string, string, boolean?][]> = {
  hero: [['kicker', '小標'], ['title', '標題'], ['subtitle', '副標', true], ['ctaText', '按鈕文字'], ['ctaHref', '按鈕連結'], ['cta2Text', '第二按鈕文字'], ['cta2Href', '第二按鈕連結'], ['imageUrl', '圖片網址'], ['videoUrl', '影片網址（YouTube／mp4）']],
  banner: [['text', '文字'], ['href', '連結']],
  stats: [['kicker', '小標'], ['title', '標題'], ['subtitle', '副標']],
  features: [['kicker', '小標'], ['title', '標題'], ['subtitle', '副標']],
  split: [['kicker', '小標'], ['title', '標題'], ['subtitle', '副標'], ['text', '內文', true], ['imageUrl', '圖片網址'], ['videoUrl', '影片網址'], ['ctaText', '按鈕文字'], ['ctaHref', '按鈕連結']],
  gallery: [['title', '標題'], ['subtitle', '副標']],
  testimonials: [['kicker', '小標'], ['title', '標題'], ['subtitle', '副標']],
  faq: [['title', '標題'], ['subtitle', '副標']],
  pricing: [['title', '標題'], ['subtitle', '副標']],
  steps: [['kicker', '小標'], ['title', '標題'], ['subtitle', '副標']],
  team: [['title', '標題'], ['subtitle', '副標']],
  logos: [['title', '標題']],
  video: [['title', '標題'], ['videoUrl', '影片網址'], ['text', '說明', true]],
  cta: [['title', '標題'], ['text', '說明', true], ['buttonText', '按鈕文字'], ['buttonHref', '按鈕連結']],
  contact: [['title', '標題'], ['subtitle', '副標'], ['mapEmbedUrl', '地圖嵌入網址']],
  categories: [['title', '標題'], ['subtitle', '副標']],
  courses: [['title', '標題'], ['subtitle', '副標'], ['ctaText', '「看全部」文字'], ['ctaHref', '「看全部」連結']],
  products: [['title', '標題'], ['subtitle', '副標'], ['ctaText', '「看全部」文字'], ['ctaHref', '「看全部」連結']],
  posts: [['title', '標題'], ['subtitle', '副標'], ['ctaText', '「看全部」文字'], ['ctaHref', '「看全部」連結']],
  html: [['title', '標題（可空）'], ['html', 'HTML', true]],
};
/** 清單型欄位（JSON 編輯） */
const LIST_FIELDS: Partial<Record<SectionKind, [string, string][]>> = {
  hero: [['highlights', '亮點 [{icon,title,text}]'], ['slides', '輪播 [{title,subtitle,imageUrl,ctaText,ctaHref}]']],
  stats: [['items', '數字 [{value,label,note}]']],
  features: [['items', '項目 [{icon,code,tag,title,text,href,ctaText}]']],
  split: [['bullets', '條列 ["…"]']],
  gallery: [['items', '圖片 [{imageUrl,caption,href}]']],
  testimonials: [['items', '見證 [{quote,name,role,avatarUrl,metric}]']],
  faq: [['items', '問答 [{q,a}]']],
  pricing: [['plans', '方案 [{name,price,period,note,features[],ctaText,ctaHref,highlight}]']],
  steps: [['items', '步驟 [{title,text}]']],
  team: [['members', '成員 [{name,role,bio,avatarUrl}]']],
  logos: [['items', '品牌 [{name,imageUrl}]']],
  contact: [['items', '聯絡 [{icon,label,value,href}]']],
  categories: [['items', '分類 [{icon,title,href,count,imageUrl}]']],
};
const NUM_FIELDS: Partial<Record<SectionKind, [string, string, number, number][]>> = {
  features: [['columns', '欄數', 1, 4]],
  gallery: [['columns', '欄數', 2, 6]],
  categories: [['columns', '欄數', 1, 4]],
  courses: [['columns', '欄數', 1, 4], ['limit', '顯示數量', 1, 24]],
  products: [['columns', '欄數', 1, 4], ['limit', '顯示數量', 1, 24]],
  posts: [['columns', '欄數', 1, 4], ['limit', '顯示數量', 1, 24]],
};
const PRESETS: Record<SectionKind, () => S> = {
  hero: () => ({ kind: 'hero', variant: 'center', title: '歡迎來到我們的網站', subtitle: '一句話說明你提供的價值', ctaText: '看課程', ctaHref: '/courses' }),
  banner: () => ({ kind: 'banner', text: '新品上市｜全站免運', href: '/store', tone: 'accent' }),
  stats: () => ({ kind: 'stats', items: [{ value: '1,000+', label: '學員' }, { value: '98%', label: '滿意度' }, { value: '12', label: '年經驗' }] }),
  features: () => ({ kind: 'features', title: '為什麼選我們', columns: 3, items: [{ title: '特色一', text: '', icon: '✨' }, { title: '特色二', text: '', icon: '🚀' }, { title: '特色三', text: '', icon: '💡' }] }),
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
  contact: () => ({ kind: 'contact', title: '聯絡我們', items: [{ icon: '✉️', label: 'Email', value: 'hello@example.com', href: 'mailto:hello@example.com' }] }),
  categories: () => ({ kind: 'categories', title: '分類', columns: 4, items: [{ title: '分類一', href: '/store' }, { title: '分類二', href: '/store' }] }),
  courses: () => ({ kind: 'courses', title: '精選課程', limit: 3, columns: 3 }),
  products: () => ({ kind: 'products', title: '熱門商品', limit: 4, columns: 4 }),
  posts: () => ({ kind: 'posts', title: '最新文章', limit: 3, columns: 3 }),
  html: () => ({ kind: 'html', title: '', html: '<p>自訂內容</p>' }),
};
const KINDS = Object.keys(PRESETS) as SectionKind[];
const input = 'w-full rounded border px-2 py-1 text-sm';
const line = { borderColor: 'var(--line)' } as const;

function JsonField({ label, value, onChange }: { label: string; value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(JSON.stringify(value ?? [], null, 1));
  const [err, setErr] = useState('');
  return (
    <label className="block text-xs sm:col-span-2">
      {label}
      {err ? <span className="ml-2 text-red-700">{err}</span> : null}
      <textarea
        className={`${input} font-mono`}
        style={line}
        rows={Math.min(12, Math.max(3, text.split('\n').length))}
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

export function HomeSectionsEditor({ initial }: { initial: SectionInput[] }) {
  const [sections, setSections] = useState<S[]>(initial as S[]);
  const [add, setAdd] = useState<SectionKind>('hero');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const upd = (i: number, patch: Record<string, unknown>) => setSections((s) => s.map((x, k) => (k === i ? ({ ...x, ...patch } as S) : x)));
  const move = (i: number, d: -1 | 1) =>
    setSections((s) => {
      const j = i + d;
      if (j < 0 || j >= s.length) return s;
      const c = [...s];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  async function save() {
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/admin/site/home', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sections }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? '已儲存首頁版面。' : `失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
    if (r.ok) setSections(j as S[]);
  }
  return (
    <div className="space-y-3">
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        區塊與「套版庫」共用 20 種類型；想一次換整站版面請到{' '}
        <Link href="/admin/site/templates" className="underline">
          套版庫
        </Link>
        。
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={add} onChange={(e) => setAdd(e.target.value as SectionKind)} className="rounded border px-2 py-1" style={line}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {SECTION_KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <button onClick={() => setSections((s) => [...s, PRESETS[add]()])} className="rounded border px-3 py-1" style={line}>
          ＋ 新增區塊
        </button>
        <button onClick={save} disabled={busy} className="rounded bg-black px-4 py-1.5 text-white disabled:opacity-50">
          儲存首頁版面
        </button>
        {msg ? <span className="text-xs">{msg}</span> : null}
      </div>
      {!sections.length ? (
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          尚無區塊：首頁會顯示 slug=home 的頁面內容或預設內容。
        </p>
      ) : null}
      <ol className="space-y-3">
        {sections.map((s, i) => {
          const kind = s.kind as SectionKind;
          return (
            <li key={i} className="rounded-lg border p-3" style={line}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold">
                  {i + 1}. {SECTION_KIND_LABELS[kind] ?? kind}
                </span>
                {VARIANTS[kind] ? (
                  <select className="rounded border px-1 py-0.5" style={line} value={String(s.variant ?? VARIANTS[kind]![0])} onChange={(e) => upd(i, { variant: e.target.value })}>
                    {VARIANTS[kind]!.map((v) => (
                      <option key={v} value={v}>
                        版式：{v}
                      </option>
                    ))}
                  </select>
                ) : null}
                <select className="rounded border px-1 py-0.5" style={line} value={String(s.tone ?? 'default')} onChange={(e) => upd(i, { tone: e.target.value })}>
                  {TONES.map((v) => (
                    <option key={v} value={v}>
                      底色：{v}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={!!s.compact} onChange={(e) => upd(i, { compact: e.target.checked })} /> 緊湊
                </label>
                <span className="flex-1" />
                <button onClick={() => move(i, -1)} className="rounded border px-2" style={line}>
                  ↑
                </button>
                <button onClick={() => move(i, 1)} className="rounded border px-2" style={line}>
                  ↓
                </button>
                <button onClick={() => setSections((x) => x.filter((_, k) => k !== i))} className="text-red-700 underline">
                  刪除
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {TEXT_FIELDS[kind]?.map(([k, label, area]) => (
                  <label key={k} className={`block text-xs ${area ? 'sm:col-span-2' : ''}`}>
                    {label}
                    {area ? (
                      <textarea className={input} style={line} rows={3} value={String(s[k] ?? '')} onChange={(e) => upd(i, { [k]: e.target.value })} />
                    ) : (
                      <input className={input} style={line} value={String(s[k] ?? '')} onChange={(e) => upd(i, { [k]: e.target.value })} />
                    )}
                  </label>
                ))}
                {NUM_FIELDS[kind]?.map(([k, label, min, max]) => (
                  <label key={k} className="block text-xs">
                    {label}
                    <input className={input} style={line} type="number" min={min} max={max} value={Number(s[k] ?? min)} onChange={(e) => upd(i, { [k]: Number(e.target.value) || min })} />
                  </label>
                ))}
                {s.tone === 'image' ? (
                  <label className="block text-xs">
                    背景圖網址
                    <input className={input} style={line} value={String(s.bgImageUrl ?? '')} onChange={(e) => upd(i, { bgImageUrl: e.target.value })} />
                  </label>
                ) : null}
                {kind === 'split' || kind === 'hero' ? (
                  <label className="block text-xs">
                    圖片位置
                    <select className={input} style={line} value={String(s.imageSide ?? 'right')} onChange={(e) => upd(i, { imageSide: e.target.value })}>
                      <option value="right">右</option>
                      <option value="left">左</option>
                    </select>
                  </label>
                ) : null}
                {LIST_FIELDS[kind]?.map(([k, label]) => (
                  <JsonField key={`${i}-${k}`} label={label} value={s[k]} onChange={(v) => upd(i, { [k]: v })} />
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

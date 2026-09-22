'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useMemo, useState } from 'react';
import { SALES_ITEM_KINDS, type SalesItemKind, type SalesPageDoc } from '@sitekit/shared';
import { addToCart, onCartChange, readCart } from '@/lib/cart';
import { DesignBody } from './DesignBody';

export interface SalesProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  price: number;
  stock: number | null;
  isActive: boolean;
  sold: number;
}
export interface SalesRender {
  id: string;
  slug: string;
  title: string;
  code: string;
  state: 'open' | 'preview';
  version: number;
  doc: Omit<SalesPageDoc, 'access'>;
  items: { productId: string; kind: SalesItemKind; order: number; badge?: string; product: SalesProduct }[];
  contentHtml: string | null;
}
const twd = (n: number) => `NT$ ${n.toLocaleString('zh-TW')}`;

/**
 * 一頁式銷售頁前台：通知列／優惠倒數／內文（設計器輸出）／優惠・組合・單品・加購產品區塊（依順序）／浮動購物車／洽詢客服／追蹤碼。
 * 加入購物車走既有 localStorage 購物車，結帳走 /cart（帶 ?sp=<code> 供訂單識別）。
 */
export function SalesPageView({ page, preview = false }: { page: SalesRender; preview?: boolean }) {
  const { doc, items } = page;
  const [noticeOpen, setNoticeOpen] = useState(true);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [cartCount, setCartCount] = useState(0);
  const [contactOpen, setContactOpen] = useState(doc.contact.display === 'expanded');
  const [toast, setToast] = useState('');
  useEffect(() => {
    const sync = () => setCartCount(readCart().reduce((s, l) => s + l.qty, 0));
    sync();
    return onCartChange(sync);
  }, []);
  const accent = doc.theme.primaryColor || 'var(--accent)';
  const radius = doc.display.buttonStyle === 'pill' ? '999px' : doc.display.buttonStyle === 'soft' ? '8px' : '0';
  const bg = doc.theme.background.type === 'color' ? doc.theme.background.value : doc.theme.background.type === 'image' && doc.theme.background.value ? `url(${doc.theme.background.value}) center/cover fixed` : '';
  const groups = useMemo(() => {
    const g: Record<SalesItemKind, typeof items> = { offer: [], bundle: [], product: [], addon: [] };
    for (const it of items) g[it.kind].push(it);
    return g;
  }, [items]);
  const contacts = [
    ['LINE', doc.contact.line ? (doc.contact.line.startsWith('http') ? doc.contact.line : `https://line.me/R/ti/p/${encodeURIComponent(doc.contact.line)}`) : ''],
    ['Facebook', doc.contact.facebook],
    ['Telegram', doc.contact.telegram ? (doc.contact.telegram.startsWith('http') ? doc.contact.telegram : `https://t.me/${doc.contact.telegram.replace(/^@/, '')}`) : ''],
    ['Email', doc.contact.email ? `mailto:${doc.contact.email}` : ''],
    ['電話', doc.contact.phone ? `tel:${doc.contact.phone}` : ''],
  ].filter(([, href]) => href) as [string, string][];

  function add(p: SalesProduct, kind: SalesItemKind) {
    const n = qty[p.id] ?? 1;
    const limit = doc.cartLimits[kind === 'bundle' ? 'offer' : kind === 'addon' ? 'addon' : kind === 'offer' ? 'offer' : 'product'];
    const cur = readCart().find((l) => l.productId === p.id)?.qty ?? 0;
    if (limit && cur + n > limit) {
      setToast(`此類商品每張訂單最多 ${limit} 件`);
      return;
    }
    if (p.stock !== null && p.stock !== undefined && cur + n > p.stock) {
      setToast('庫存不足');
      return;
    }
    addToCart(p.id, n);
    setToast(`已加入購物車：${p.name} ×${n}`);
    setTimeout(() => setToast(''), 2500);
    try {
      if (doc.tracking.events.addToCart) new Function('product', 'qty', doc.tracking.events.addToCart)(p, n);
    } catch {
      /* ignore */
    }
  }

  const cols = doc.display.columnsDesktop;
  const gridClass = cols === 0 ? 'grid-cols-1' : cols === 1 ? 'sm:grid-cols-1' : cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4';
  const mobileClass = doc.display.columnsMobile === 2 ? 'grid-cols-2' : 'grid-cols-1';

  const Section = ({ kind }: { kind: SalesItemKind }) => {
    const list = groups[kind];
    if (!doc.sections.enabled[kind] || !list.length) return null;
    return (
      <section id={kind === 'offer' ? 'sk-products' : undefined} className="sk-sales-section">
        <h2 className="mb-3 text-xl font-bold">{doc.sections.titles[kind] || SALES_ITEM_KINDS.find((k) => k.key === kind)?.label}</h2>
        <div className={`grid gap-3 ${cols === 0 ? 'grid-cols-1' : `${mobileClass} ${gridClass}`}`}>
          {list.map(({ product: p, badge }) => (
            <article key={p.id} className={`flex gap-3 rounded-xl border bg-white p-3 ${cols === 0 ? 'flex-row' : 'flex-col'}`} style={{ borderColor: 'var(--line)' }}>
              <div className={`relative shrink-0 overflow-hidden rounded-lg bg-neutral-100 ${cols === 0 ? 'h-28 w-28' : 'w-full'}`} style={{ aspectRatio: doc.display.imageRatio === 'original' ? undefined : '1/1' }}>
                {p.coverUrl ? <img src={p.coverUrl} alt="" className={`h-full w-full ${doc.display.imageRatio === 'square-fit' ? 'object-contain' : 'object-cover'}`} /> : null}
                {badge ? (
                  <span className="absolute left-1 top-1 rounded px-1.5 py-0.5 text-[11px] font-bold text-white" style={{ background: accent }}>
                    {badge}
                  </span>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h3 className="font-semibold">{p.name}</h3>
                {p.description ? <p className="line-clamp-2 text-xs opacity-70">{p.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}</p> : null}
                <p className="text-lg font-bold" style={{ color: accent }}>
                  {twd(p.price)}
                </p>
                <p className="text-[11px] opacity-60">
                  {doc.display.showStock !== 'never' && p.stock !== null && (doc.display.showStock === 'always' || p.stock < 10) ? `剩餘 ${p.stock} ` : ''}
                  {doc.display.showSold !== 'never' ? `已售 ${p.sold}` : ''}
                </p>
                <div className="mt-auto flex items-center gap-2">
                  {doc.display.quantityMode === 'select' ? (
                    <select className="rounded border px-1 py-1 text-sm" style={{ borderColor: 'var(--line)' }} value={qty[p.id] ?? 1} onChange={(e) => setQty({ ...qty, [p.id]: Number(e.target.value) })}>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="flex items-center rounded border text-sm" style={{ borderColor: 'var(--line)' }}>
                      <button className="px-2" onClick={() => setQty({ ...qty, [p.id]: Math.max(1, (qty[p.id] ?? 1) - 1) })}>
                        −
                      </button>
                      <span className="w-6 text-center">{qty[p.id] ?? 1}</span>
                      <button className="px-2" onClick={() => setQty({ ...qty, [p.id]: (qty[p.id] ?? 1) + 1 })}>
                        ＋
                      </button>
                    </span>
                  )}
                  <button onClick={() => add(p, kind)} disabled={p.stock === 0} className="px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40" style={{ background: accent, borderRadius: radius }}>
                    {p.stock === 0 ? '售完' : '選購'}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="sk-sales" style={{ ['--accent' as string]: accent, ...(bg ? { background: bg } : {}) }}>
      {doc.theme.customCss ? <style dangerouslySetInnerHTML={{ __html: doc.theme.customCss }} /> : null}
      {!preview && doc.tracking.head ? <div dangerouslySetInnerHTML={{ __html: doc.tracking.head }} /> : null}
      {!preview && doc.tracking.ga4 ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(doc.tracking.ga4)}`} strategy="afterInteractive" />
          <Script id="sk-ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${doc.tracking.ga4.replace(/'/g, '')}');`}</Script>
        </>
      ) : null}
      {!preview && doc.tracking.fbPixel ? <Script id="sk-fbq" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${doc.tracking.fbPixel.replace(/'/g, '')}');fbq('track','PageView',{pageId:'${page.id}',pageTitle:${JSON.stringify(page.title)}});`}</Script> : null}
      {!preview && doc.tracking.bodyTop ? <div dangerouslySetInnerHTML={{ __html: doc.tracking.bodyTop }} /> : null}

      {doc.notice.enabled && doc.notice.text && noticeOpen ? (
        <div className="sticky top-0 z-30 flex items-center justify-between gap-2 px-4 py-2 text-sm text-white" style={{ background: accent }}>
          <span dangerouslySetInnerHTML={{ __html: doc.notice.text }} />
          <button onClick={() => setNoticeOpen(false)} aria-label="關閉" className="px-2">
            ✕
          </button>
        </div>
      ) : null}
      {doc.countdown.enabled && doc.countdown.endsAt ? <Countdown endsAt={doc.countdown.endsAt} text={doc.countdown.text} accent={accent} /> : null}

      <div className="mx-auto" style={{ maxWidth: doc.theme.maxWidth, paddingTop: doc.theme.topPadding }}>
        <div className="space-y-8">
          {doc.sections.order.map((k) => {
            if (k === 'content') return page.contentHtml ? <DesignBody key={k} html={page.contentHtml} fullBleed={false} className="rounded-xl bg-white" /> : null;
            if (k === 'cart')
              return (
                <section key={k} className="rounded-xl border bg-white p-4 text-center" style={{ borderColor: 'var(--line)' }}>
                  <p className="text-sm">
                    購物車 <strong>{cartCount}</strong> 件
                  </p>
                  <Link href={`/cart?sp=${encodeURIComponent(page.code)}`} className="mt-2 inline-block px-6 py-2 font-bold text-white" style={{ background: accent, borderRadius: radius }}>
                    前往結帳
                  </Link>
                  {doc.form.note.enabled && doc.form.note.text ? <div className="mt-3 text-left text-xs opacity-80" dangerouslySetInnerHTML={{ __html: doc.form.note.text }} /> : null}
                </section>
              );
            if (k === 'contact')
              return contacts.length ? (
                <section key={k} className="rounded-xl border bg-white p-4 text-center text-sm" style={{ borderColor: 'var(--line)' }}>
                  <p className="mb-2 font-semibold">洽詢客服</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {contacts.map(([label, href]) => (
                      <a key={label} href={href} target="_blank" rel="noopener" className="rounded-full border px-3 py-1" style={{ borderColor: 'var(--line)' }}>
                        {label}
                      </a>
                    ))}
                  </div>
                </section>
              ) : null;
            return <Section key={k} kind={k as SalesItemKind} />;
          })}
        </div>
      </div>

      {cartCount > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full px-5 py-2 text-sm font-bold text-white shadow-lg" style={{ background: accent }}>
          <Link href={`/cart?sp=${encodeURIComponent(page.code)}`}>購物車 {cartCount} 件 → 前往結帳</Link>
        </div>
      ) : null}
      {contacts.length ? (
        <div className="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-1">
          {contactOpen ? contacts.map(([label, href]) => (
            <a key={label} href={href} target="_blank" rel="noopener" className="rounded-full bg-white px-3 py-1 text-xs shadow" style={{ border: '1px solid var(--line)' }}>
              {label}
            </a>
          )) : null}
          {doc.contact.display === 'collapsed' ? (
            <button onClick={() => setContactOpen((o) => !o)} className="rounded-full px-4 py-2 text-sm font-bold text-white shadow-lg" style={{ background: accent }}>
              {contactOpen ? '收合' : '客服'}
            </button>
          ) : null}
        </div>
      ) : null}
      {toast ? <div className="fixed bottom-16 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-black/80 px-4 py-2 text-sm text-white">{toast}</div> : null}
      {!preview && doc.tracking.bodyBottom ? <div dangerouslySetInnerHTML={{ __html: doc.tracking.bodyBottom }} /> : null}
    </div>
  );
}

function Countdown({ endsAt, text, accent }: { endsAt: string; text: string; accent: string }) {
  // 先以 null 渲染（伺服器與客戶端一致），掛載後才開始倒數，避免 hydration 不一致
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(new Date(endsAt).getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  if (left === null || left <= 0) return null;
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <div className="sticky top-0 z-20 flex items-center justify-center gap-3 px-4 py-2 text-sm text-white" style={{ background: accent, filter: 'brightness(0.9)' }}>
      <span>{text}</span>
      <span className="font-mono font-bold">
        {d > 0 ? `${d} 天 ` : ''}
        {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(sec).padStart(2, '0')}
      </span>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '@/lib/i18n';

interface Slot {
  el: HTMLElement;
  widget: 'products' | 'courses' | 'posts';
  limit: number;
}
type Row = { key: string; href: string; title: string; sub?: string; img?: string | null };
const twd = (n: number) => `NT$ ${n.toLocaleString('zh-TW')}`;

/** 靜態 HTML 容器獨立成 memo 元件：父層 state 變動（slots／data）時不重渲染，React 才不會重設 innerHTML 把 portal 掛載點洗掉 */
const StaticHtml = memo(function StaticHtml({ html, hostRef, className, fullBleed }: { html: string; hostRef: React.RefObject<HTMLDivElement | null>; className?: string; fullBleed: boolean }) {
  // React 19 以 props 物件同一性判斷是否重設 innerHTML：style／__html 物件都在此元件內產生，父層重渲染不會傳入新物件
  return <div ref={hostRef} className={className} style={fullBleed ? { width: '100vw', marginLeft: 'calc(50% - 50vw)' } : undefined} dangerouslySetInnerHTML={{ __html: html }} />;
});

/**
 * 設計器輸出的頁面 HTML（含 <style>）直接掛載；`sk-widget`（商品／課程／文章）以 portal 在前端自動帶入資料。
 * 全幅（breakout）呈現：不受 main 的 max-width 限制，讓 section 背景滿版。
 */
export function DesignBody({ html, fullBleed = true, className = '' }: { html: string; fullBleed?: boolean; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [data, setData] = useState<Record<string, Row[]>>({});

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const found: Slot[] = [];
    root.querySelectorAll<HTMLElement>('.sk-widget[data-widget]').forEach((el) => {
      const body = el.querySelector<HTMLElement>('.sk-widget-body');
      if (!body) return;
      // 每次都換一個全新的掛載點（StrictMode／Fast Refresh 重跑 effect 時，舊 portal 容器被丟棄、新 portal 進新容器）
      const mount = document.createElement('div');
      body.replaceChildren(mount);
      found.push({ el: mount, widget: el.dataset.widget as Slot['widget'], limit: Number(el.dataset.limit) || 6 });
    });
    setSlots(found);
    const kinds = Array.from(new Set(found.map((s) => s.widget)));
    kinds.forEach(async (k) => {
      try {
        const path = k === 'products' ? '/api/catalog/products' : k === 'courses' ? '/api/catalog/courses' : '/api/content/posts?limit=24';
        const r = await fetch(path);
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        let rows: Row[] = [];
        if (k === 'products') rows = (j as { id: string; name: string; price: number; coverUrl: string | null; course?: { slug: string } | null }[]).map((p) => ({ key: p.id, href: p.course?.slug ? `/course/${p.course.slug}` : '/store', title: p.name, sub: twd(p.price), img: p.coverUrl }));
        else if (k === 'courses') rows = (j as { id: string; slug: string; summary: string | null; product: { name: string; price: number; coverUrl: string | null } }[]).map((c) => ({ key: c.id, href: `/course/${c.slug}`, title: c.product.name, sub: c.summary ?? twd(c.product.price), img: c.product.coverUrl }));
        else rows = ((j as { items: { slug: string; title: string; excerpt: string | null; coverUrl: string | null }[] }).items ?? []).map((p) => ({ key: p.slug, href: `/blog/${p.slug}`, title: p.title, sub: p.excerpt ?? undefined, img: p.coverUrl }));
        setData((d) => ({ ...d, [k]: rows }));
      } catch {
        setData((d) => ({ ...d, [k]: [] }));
      }
    });
  }, [html]);

  return (
    <>
      <StaticHtml html={html} hostRef={host} className={className} fullBleed={fullBleed} />
      {slots.map((s, i) => {
        const rows = data[s.widget];
        return createPortal(
          rows === undefined ? (
            <div className="sk-widget-empty">{t('載入中…')}</div>
          ) : rows.length ? (
            <div className="sk-widget-grid">
              {rows.slice(0, s.limit).map((r) => (
                <Link key={r.key} href={r.href}>
                  {r.img ? <img src={r.img} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null}
                  <div className="sk-w-title">{r.title}</div>
                  {r.sub ? <div className="sk-w-sub">{r.sub}</div> : null}
                </Link>
              ))}
            </div>
          ) : (
            <div className="sk-widget-empty">{t('尚無資料')}</div>
          ),
          s.el,
          `${s.widget}-${i}`,
        );
      })}
    </>
  );
}

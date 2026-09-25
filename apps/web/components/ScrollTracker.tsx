'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { skTrackCustom } from '@/lib/track';

/**
 * 滑動追蹤（全站掛一個，在 root layout 的 Tracking 內）：
 * 1) 區塊事件：任何帶 data-sk-track="事件名" 的元素（設計器區塊 node.track、套版區塊 look.track、銷售頁模板每一段）
 *    進入可視範圍達 data-sk-track-percent（該區塊自身可見百分比，預設 50）時送出自訂事件；data-sk-track-once 只送一次。
 * 2) 頁面滑動深度：依 window.__skTracking.scroll（網站設定／頁面覆蓋）的 percents（預設 25/50/75/100）送 scroll_depth，每頁每個百分比一次。
 * 送到 GA4（gtag event）、Meta（trackCustom）、TikTok（track）、dataLayer，並執行後台「滑動事件 JS」。
 */
const THRESHOLDS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

export function ScrollTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const firedBlocks = new Set<string>();
    const firedDepth = new Set<number>();
    const pageOf = () => {
      const p = window.__skPage;
      return p && p.pathname === pathname ? { id: p.id, title: p.title, type: p.type } : undefined;
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const el = e.target as HTMLElement;
          const event = el.dataset.skTrack;
          if (!event) continue;
          const need = Math.max(1, Math.min(100, Number(el.dataset.skTrackPercent) || 50));
          const seen = Math.round(e.intersectionRatio * 100);
          if (seen < need) continue;
          const once = el.dataset.skTrackOnce !== '0';
          const key = `${event}:${el.dataset.sk ?? el.id ?? ''}`;
          if (once && firedBlocks.has(key)) continue;
          firedBlocks.add(key);
          skTrackCustom(event, { block: el.dataset.skTrackLabel || el.id || undefined, percent: seen, page: pageOf() });
          if (once) io.unobserve(el);
        }
      },
      { threshold: THRESHOLDS },
    );
    const scan = () => document.querySelectorAll<HTMLElement>('[data-sk-track]').forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(scan, 200);
    });
    let t: ReturnType<typeof setTimeout> | undefined;
    mo.observe(document.body, { childList: true, subtree: true });

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const cfg = window.__skTracking?.scroll;
        if (cfg && cfg.enabled === false) return;
        const percents = cfg?.percents?.length ? cfg.percents : [25, 50, 75, 100];
        const name = cfg?.event || 'scroll_depth';
        const doc = document.documentElement;
        const total = Math.max(doc.scrollHeight, document.body.scrollHeight) - window.innerHeight;
        const pct = total <= 0 ? 100 : Math.min(100, Math.round(((window.scrollY || doc.scrollTop) / total) * 100));
        for (const p of percents) {
          if (pct >= p && !firedDepth.has(p)) {
            firedDepth.add(p);
            skTrackCustom(name, { percent: p, page: pageOf() });
          }
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    const t0 = setTimeout(onScroll, 800);
    return () => {
      io.disconnect();
      mo.disconnect();
      clearTimeout(t);
      clearTimeout(t0);
      window.removeEventListener('scroll', onScroll);
    };
  }, [pathname]);
  return null;
}

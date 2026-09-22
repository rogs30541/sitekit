'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { hasTracking, mergeTracking, normalizeTracking, type TrackingConfig } from '@sitekit/shared';
import { skTrack } from '@/lib/track';

const clean = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '');

/** 把自訂 HTML 插進 DOM 並讓其中的 <script> 真的執行（innerHTML 不會執行 script） */
function InjectHtml({ html, id }: { html: string; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || !html) return;
    host.innerHTML = '';
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    for (const node of Array.from(tpl.content.childNodes)) {
      if (node.nodeName === 'SCRIPT') {
        const src = node as HTMLScriptElement;
        const s = document.createElement('script');
        for (const a of Array.from(src.attributes)) s.setAttribute(a.name, a.value);
        s.text = src.text;
        host.appendChild(s);
      } else host.appendChild(node.cloneNode(true));
    }
    // 內層 script（例如包在 <div> 裡）也要重建
    host.querySelectorAll('div script, span script, p script').forEach((old) => {
      const s = document.createElement('script');
      for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value);
      s.text = (old as HTMLScriptElement).text;
      old.replaceWith(s);
    });
  }, [html]);
  return <div ref={ref} data-sk-inject={id} style={{ display: 'contents' }} />;
}

/**
 * 追蹤碼區塊：網站層級（root layout）與頁面層級（/p、首頁、銷售頁）都用同一元件。
 * - scope="site"：載入 GTM／GA4／Meta／TikTok／LINE 基本碼＋自訂 Head/Body 碼，並在路由變更時送 PageView。
 * - scope="page"：只載入「頁面有、網站沒有」的 ID 與頁面自訂碼；把合併後的設定寫到 window.__skTracking 供 skTrack 使用；送帶 pageId 的 PageView。
 */
export function Tracking({ config, site, scope = 'site', page }: { config: Partial<TrackingConfig> | null | undefined; site?: TrackingConfig; scope?: 'site' | 'page'; page?: { id: string; title: string; type: string } }) {
  const pathname = usePathname();
  const own = normalizeTracking(config ?? {});
  const merged = scope === 'page' && site ? mergeTracking(site, own) : own;
  // 頁面層級：與網站相同的 ID 不重複載入
  const load = scope === 'page' && site ? { ga4: own.ga4 && own.ga4 !== site.ga4 ? own.ga4 : '', gtm: own.gtm && own.gtm !== site.gtm ? own.gtm : '', fbPixel: own.fbPixel && own.fbPixel !== site.fbPixel ? own.fbPixel : '', tiktok: own.tiktok && own.tiktok !== site.tiktok ? own.tiktok : '', lineTag: own.lineTag && own.lineTag !== site.lineTag ? own.lineTag : '', head: own.head, bodyTop: own.bodyTop, bodyBottom: own.bodyBottom } : own;
  const fired = useRef('');
  useEffect(() => {
    window.__skTracking = merged;
    const key = `${scope}:${pathname}:${page?.id ?? ''}`;
    if (fired.current === key) return;
    fired.current = key;
    if (scope === 'site' && page) return; // 頁面層級會送帶 pageId 的 PageView
    const t = setTimeout(() => skTrack('PageView', { page }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, page?.id, scope]);
  if (!hasTracking(load as TrackingConfig) && !hasTracking(merged)) return null;
  const prefix = scope === 'page' ? `sk-p-${page?.id ?? 'x'}-` : 'sk-';
  return (
    <>
      {load.gtm ? (
        <>
          <script id={`${prefix}gtm`} dangerouslySetInnerHTML={{ __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${clean(load.gtm)}');` }} />
          <noscript>
            <iframe src={`https://www.googletagmanager.com/ns.html?id=${clean(load.gtm)}`} height="0" width="0" style={{ display: 'none', visibility: 'hidden' }} />
          </noscript>
        </>
      ) : null}
      {load.ga4 ? (
        <>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${clean(load.ga4)}`} />
          <script id={`${prefix}ga4`} dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=window.gtag||gtag;gtag('js',new Date());gtag('config','${clean(load.ga4)}',{send_page_view:false});${merged.googleAdsId ? `gtag('config','${clean(merged.googleAdsId)}');` : ''}` }} />
        </>
      ) : merged.googleAdsId && scope === 'site' && !merged.ga4 ? (
        <>
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${clean(merged.googleAdsId)}`} />
          <script id={`${prefix}aw`} dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=window.gtag||gtag;gtag('js',new Date());gtag('config','${clean(merged.googleAdsId)}');` }} />
        </>
      ) : null}
      {load.fbPixel ? <script id={`${prefix}fbq`} dangerouslySetInnerHTML={{ __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${clean(load.fbPixel)}');` }} /> : null}
      {load.tiktok ? <script id={`${prefix}ttq`} dangerouslySetInnerHTML={{ __html: `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${clean(load.tiktok)}');}(window,document,'ttq');` }} /> : null}
      {load.lineTag ? <script id={`${prefix}lt`} dangerouslySetInnerHTML={{ __html: `(function(g,d,o){g._ltq=g._ltq||[];g._lt=g._lt||function(){g._ltq.push(arguments)};var h=location.protocol==='https:'?'https://d.line-scdn.net':'http://d.line-cdn.net';var s=d.createElement('script');s.async=1;s.src=o||h+'/n/line_tag/public/release/v1/lt.js';var t=d.getElementsByTagName('script')[0];t.parentNode.insertBefore(s,t);})(window,document);_lt('init',{customerType:'lap',tagId:'${clean(load.lineTag)}'});_lt('send','pv',['${clean(load.lineTag)}']);` }} /> : null}
      {load.head ? <InjectHtml html={load.head} id={`${prefix}head`} /> : null}
      {load.bodyTop ? <InjectHtml html={load.bodyTop} id={`${prefix}top`} /> : null}
      {load.bodyBottom ? <InjectHtml html={load.bodyBottom} id={`${prefix}bottom`} /> : null}
    </>
  );
}

'use client';

import type { TrackingConfig } from '@sitekit/shared';

export type TrackEvent = 'PageView' | 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase';
export interface TrackParams {
  value?: number;
  currency?: string;
  items?: { id: string; name: string; price: number; qty?: number }[];
  product?: { id: string; name: string; price: number };
  qty?: number;
  order?: { no: string; amount: number; items: { name: string; qty: number }[] };
  page?: { id: string; title: string; type: string };
}
declare global {
  interface Window {
    __skTracking?: TrackingConfig;
    __skTrackSeen?: Record<string, true>;
    __skPage?: { id: string; title: string; type: string; pathname: string };
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    ttq?: { track: (name: string, params?: unknown) => void; page?: () => void };
    _lt?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}
const GA_EVENT: Record<TrackEvent, string> = { PageView: 'page_view', ViewContent: 'view_item', AddToCart: 'add_to_cart', InitiateCheckout: 'begin_checkout', Purchase: 'purchase' };
const TT_EVENT: Record<TrackEvent, string> = { PageView: 'Pageview', ViewContent: 'ViewContent', AddToCart: 'AddToCart', InitiateCheckout: 'InitiateCheckout', Purchase: 'CompletePayment' };

/** 自訂事件（滑動深度／區塊可視等）：GA4 gtag event、Meta trackCustom、TikTok track、dataLayer，並執行後台「滑動事件 JS」 */
export function skTrackCustom(name: string, params: { percent?: number; block?: string; page?: { id: string; title: string; type: string } } = {}) {
  if (typeof window === 'undefined') return;
  const cfg = window.__skTracking;
  const payload = { percent: params.percent, block: params.block, page_id: params.page?.id, page_title: params.page?.title, page_type: params.page?.type };
  try {
    // 先建 dataLayer：GTM／GA 晚載入也能讀到已緩衝的事件
    (window.dataLayer = window.dataLayer || []).push({ event: name, ...payload });
  } catch {
    /* ignore */
  }
  try {
    if (window.gtag) window.gtag('event', name, payload);
  } catch {
    /* ignore */
  }
  try {
    if (window.fbq) window.fbq('trackCustom', name, payload);
  } catch {
    /* ignore */
  }
  try {
    if (window.ttq) window.ttq.track(name, payload);
  } catch {
    /* ignore */
  }
  try {
    const code = cfg?.events?.scroll;
    if (code) new Function('event', 'percent', 'block', 'page', code)(name, params.percent, params.block, params.page);
  } catch (e) {
    console.warn('[tracking] scroll event error', e);
  }
}

/** 一次呼叫送到所有已載入的追蹤器（GA4／Meta／TikTok／LINE／Google Ads）＋執行後台設定的自訂事件 JS；`once` 以 key 去重（例如同一訂單只送一次 Purchase）。 */
export function skTrack(event: TrackEvent, params: TrackParams = {}, once?: string) {
  if (typeof window === 'undefined') return;
  if (once) {
    window.__skTrackSeen ??= {};
    const key = `${event}:${once}`;
    if (window.__skTrackSeen[key]) return;
    window.__skTrackSeen[key] = true;
    try {
      const k = `sk.track.${key}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
    } catch {
      /* ignore */
    }
  }
  const cfg = window.__skTracking;
  const value = params.value ?? params.order?.amount ?? (params.product ? params.product.price * (params.qty ?? 1) : undefined);
  const currency = params.currency ?? 'TWD';
  const gaItems = (params.items ?? (params.product ? [{ ...params.product, qty: params.qty ?? 1 }] : [])).map((i) => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.qty ?? 1 }));
  try {
    if (window.gtag) {
      if (event === 'PageView') window.gtag('event', 'page_view', { page_title: params.page?.title, page_location: location.href });
      else window.gtag('event', GA_EVENT[event], { value, currency, items: gaItems, ...(event === 'Purchase' && params.order ? { transaction_id: params.order.no } : {}) });
      if (event === 'Purchase' && cfg?.googleAdsId) window.gtag('event', 'conversion', { send_to: cfg.googleAdsLabel ? `${cfg.googleAdsId}/${cfg.googleAdsLabel}` : cfg.googleAdsId, value, currency, transaction_id: params.order?.no });
    }
  } catch {
    /* ignore */
  }
  try {
    if (window.fbq) window.fbq('track', event, { pageId: params.page?.id, pageTitle: params.page?.title, value, currency, ...(params.product ? { productTitle: params.product.name, productQty: params.qty ?? 1, content_ids: [params.product.id], content_type: 'product' } : {}), ...(params.order ? { order_id: params.order.no, num_items: params.order.items.reduce((s, i) => s + i.qty, 0) } : {}) });
  } catch {
    /* ignore */
  }
  try {
    if (window.ttq) {
      if (event === 'PageView') window.ttq.page?.();
      else window.ttq.track(TT_EVENT[event], { value, currency, contents: gaItems.map((i) => ({ content_id: i.item_id, content_name: i.item_name, price: i.price, quantity: i.quantity })) });
    }
  } catch {
    /* ignore */
  }
  try {
    if (window._lt && cfg?.lineTag && (event === 'AddToCart' || event === 'Purchase')) window._lt('send', 'cv', { type: event === 'Purchase' ? 'Conversion' : 'AddToCart', value, currency }, [cfg.lineTag]);
  } catch {
    /* ignore */
  }
  try {
    const code = cfg?.events?.[event === 'PageView' ? 'pageView' : event === 'ViewContent' ? 'viewContent' : event === 'AddToCart' ? 'addToCart' : event === 'InitiateCheckout' ? 'initiateCheckout' : 'purchase'];
    if (code) new Function('page', 'product', 'qty', 'value', 'currency', 'items', 'order', code)(params.page, params.product, params.qty, value, currency, params.items, params.order);
  } catch (e) {
    console.warn('[tracking] custom event error', e);
  }
}

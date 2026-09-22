/**
 * 一頁式銷售頁（對標 1shop「銷售頁」）：一份 JSON 文件描述整頁——通知列／優惠倒數／內文（設計文件）／產品區塊／表單規則／順序／追蹤／SEO／主題。
 * 草稿（draft）與線上快照（live）分開存；發佈需確認並備份版本。
 */
import type { DesignDoc } from './design';
import { defaultTracking, normalizeTracking, type TrackingConfig } from './tracking';

export type SalesItemKind = 'offer' | 'bundle' | 'product' | 'addon';
export const SALES_ITEM_KINDS: { key: SalesItemKind; label: string; desc: string }[] = [
  { key: 'offer', label: '優惠區塊', desc: '主力優惠／限時價，建議放最前面' },
  { key: 'bundle', label: '產品組合區塊', desc: '套餐、任選組合' },
  { key: 'product', label: '一般產品區塊', desc: '單品' },
  { key: 'addon', label: '加購品區塊', desc: '加價購，依序顯示在一般產品後' },
];
export type SalesSectionKey = 'content' | 'offer' | 'bundle' | 'product' | 'addon' | 'cart' | 'contact';
export const SALES_SECTIONS: { key: SalesSectionKey; label: string }[] = [
  { key: 'content', label: '內文區塊' },
  { key: 'offer', label: '優惠區塊' },
  { key: 'bundle', label: '產品組合區塊' },
  { key: 'product', label: '一般產品區塊' },
  { key: 'addon', label: '加購區塊' },
  { key: 'cart', label: '購物車區塊' },
  { key: 'contact', label: '洽詢客服區塊' },
];

export interface SalesCustomField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox';
  required: boolean;
  options?: string[];
}
export interface SalesPageDoc {
  version: 1;
  /** 銷售頁通知（頁面最上方，可關閉） */
  notice: { enabled: boolean; text: string };
  /** 優惠倒數（頁面最上方，不可關閉） */
  countdown: { enabled: boolean; endsAt: string; text: string };
  /** 內文：沿用頁面設計器文件（區段／圖片／影片／文字／HTML／加入購物車…） */
  content: DesignDoc | null;
  /** 內文加入購物車按鈕、瀏覽漏斗 */
  contentOptions: { addToCartButton: boolean; funnelTracking: boolean };
  /** 產品區塊設定與順序 */
  sections: { order: SalesSectionKey[]; titles: Record<SalesItemKind, string>; enabled: Record<SalesItemKind, boolean> };
  /** 掛在此頁的產品（商品 id、種類、順序、標籤） */
  items: { productId: string; kind: SalesItemKind; order: number; badge?: string }[];
  theme: { primaryColor: string; background: { type: 'none' | 'color' | 'image'; value: string }; maxWidth: number; topPadding: number; customCss: string };
  display: { columnsDesktop: 1 | 2 | 3 | 4 | 0; columnsMobile: 1 | 2; buttonStyle: 'pill' | 'soft' | 'square'; quantityMode: 'buttons' | 'select'; showStock: 'never' | 'always' | 'low'; showSold: 'never' | 'always' | 'low'; imageRatio: 'square-crop' | 'square-fit' | 'original' };
  cartLimits: { offer: number | null; product: number | null; addon: number | null };
  form: { mode: 'multi' | 'one' | 'one-after-click'; checkoutCountdown: { enabled: boolean; minutes: number; text: string }; memberLogin: 'optional' | 'required' | 'hidden'; note: { enabled: boolean; text: string }; phone: { label: string; help: string; rule: 'none' | 'mobile' | 'landline' | 'any' }; email: { label: string; help: string; required: boolean }; deliveryTime: { enabled: boolean; label: string; help: string }; customFields: SalesCustomField[]; invoice: boolean; coupon: boolean; privacy: boolean };
  contact: { line: string; facebook: string; telegram: string; email: string; phone: string; display: 'collapsed' | 'expanded' };
  /** 頁面層級追蹤碼（留空沿用網站設定） */
  tracking: TrackingConfig;
  success: { note: { enabled: boolean; text: string }; recommendSlug: string };
  seo: { title: string; description: string; ogImage: string; favicon: string };
  schedule: { openAt: string; closeAt: string; closedMessage: string; closedOrdersPayable: boolean };
  access: { passwordEnabled: boolean; password: string };
  texts: { priceSingle: string; priceRange: string; priceSpecial: string };
}

export const defaultSalesDoc = (): SalesPageDoc => ({
  version: 1,
  notice: { enabled: false, text: '' },
  countdown: { enabled: false, endsAt: '', text: '優惠倒數中' },
  content: null,
  contentOptions: { addToCartButton: true, funnelTracking: false },
  sections: { order: ['content', 'offer', 'bundle', 'product', 'addon', 'cart', 'contact'], titles: { offer: '優惠折扣', bundle: '熱銷組合', product: '精選單品', addon: '加價購' }, enabled: { offer: true, bundle: true, product: true, addon: true } },
  items: [],
  theme: { primaryColor: '', background: { type: 'none', value: '' }, maxWidth: 800, topPadding: 0, customCss: '' },
  display: { columnsDesktop: 0, columnsMobile: 1, buttonStyle: 'pill', quantityMode: 'buttons', showStock: 'never', showSold: 'never', imageRatio: 'square-crop' },
  cartLimits: { offer: null, product: null, addon: null },
  form: { mode: 'multi', checkoutCountdown: { enabled: false, minutes: 10, text: '限時優惠，請儘速完成結帳' }, memberLogin: 'optional', note: { enabled: false, text: '' }, phone: { label: '聯絡電話', help: '', rule: 'mobile' }, email: { label: 'Email', help: '', required: true }, deliveryTime: { enabled: false, label: '方便收貨時間', help: '' }, customFields: [], invoice: true, coupon: true, privacy: true },
  contact: { line: '', facebook: '', telegram: '', email: '', phone: '', display: 'collapsed' },
  tracking: defaultTracking(),
  success: { note: { enabled: false, text: '' }, recommendSlug: '' },
  seo: { title: '', description: '', ogImage: '', favicon: '' },
  schedule: { openAt: '', closeAt: '', closedMessage: '本銷售頁已結束，感謝您的支持。', closedOrdersPayable: true },
  access: { passwordEnabled: false, password: '' },
  texts: { priceSingle: '{{currency_price}}', priceRange: '{{currency_price}}', priceSpecial: '{{currency_price_special}}' },
});

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** 深度合併到預設值（只接受預設值有的鍵；陣列整個取代） */
export function mergeSalesDoc(base: SalesPageDoc, patch: unknown): SalesPageDoc {
  const walk = (b: unknown, p: unknown): unknown => {
    if (Array.isArray(b)) return Array.isArray(p) ? p : b;
    if (isObj(b)) {
      if (!isObj(p)) return b;
      const out: Record<string, unknown> = { ...b };
      for (const k of Object.keys(b)) if (k in p) out[k] = walk(b[k], p[k]);
      return out;
    }
    if (b === null) return p === undefined ? b : p; // content: DesignDoc|null
    return p === undefined || p === null ? b : typeof p === typeof b ? p : b;
  };
  return walk(base, patch) as SalesPageDoc;
}
export const normalizeSalesDoc = (input: unknown): SalesPageDoc => {
  const d = mergeSalesDoc(defaultSalesDoc(), input);
  d.tracking = normalizeTracking(d.tracking);
  return d;
};

/** 銷售頁狀態（依排程） */
export function salesPageState(page: { status: string; doc: SalesPageDoc }, now = Date.now()): 'draft' | 'open' | 'scheduled' | 'closed' {
  if (page.status !== 'published') return 'draft';
  const { openAt, closeAt } = page.doc.schedule;
  if (openAt && new Date(openAt).getTime() > now) return 'scheduled';
  if (closeAt && new Date(closeAt).getTime() < now) return 'closed';
  return 'open';
}

export const SALES_STATUS_LABELS: Record<string, string> = { draft: '草稿（未上線）', published: '公開', closed: '已關閉', open: '公開中', scheduled: '預約開啟' };

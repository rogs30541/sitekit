import { parseCsv } from './csv';
import { sanitizeHtml, slugify } from '../normalize';

export interface CanonicalProduct {
  sku: string;
  name: string;
  type: 'physical' | 'course' | 'credit_pack';
  price: number;
  description: string | null;
  coverUrl: string | null;
  stock: number | null;
  isActive: boolean;
  raw?: unknown;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '');
const pick = (row: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) {
    const v = row[norm(k)];
    if (v !== undefined && v.trim() !== '') return v.trim();
  }
  return '';
};
const toInt = (s: string) => {
  const n = Math.round(Number(String(s).replace(/[^0-9.-]/g, '')));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * 商品 CSV 連接器。兩種表頭都吃：
 * 1. 簡式：sku, name, price, type(physical|course|credit_pack), description, cover_url, stock, active
 * 2. Shopify 商品匯出：Handle, Title, Body (HTML), Variant SKU, Variant Price, Variant Inventory Qty, Image Src, Published
 *    （同 Handle 多列＝多規格：每個 Variant SKU 各成一件商品，名稱附規格 Option1 Value；缺 SKU 用 handle-序號）
 */
export function fromProductsCsv(text: string): CanonicalProduct[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map(norm);
  const out: CanonicalProduct[] = [];
  const shopify = header.includes('handle') && header.includes('title');
  let lastHandle: { handle: string; title: string; body: string; image: string; published: boolean } | null = null;
  let seq = 0;
  for (const r of rows.slice(1)) {
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = r[i] ?? ''));
    if (shopify) {
      const handle = pick(row, 'handle');
      const title = pick(row, 'title');
      if (title) {
        lastHandle = { handle, title, body: pick(row, 'body(html)', 'body'), image: pick(row, 'imagesrc', 'variantimage'), published: pick(row, 'published').toLowerCase() !== 'false' };
        seq = 0;
      }
      if (!lastHandle || (handle && lastHandle.handle !== handle)) continue;
      seq++;
      const price = toInt(pick(row, 'variantprice', 'price'));
      if (!Number.isFinite(price)) continue;
      const opt = [pick(row, 'option1value'), pick(row, 'option2value'), pick(row, 'option3value')].filter((v) => v && v.toLowerCase() !== 'default title').join(' / ');
      const sku = pick(row, 'variantsku', 'sku') || `${slugify(lastHandle.handle || lastHandle.title, lastHandle.title)}-${seq}`;
      const qty = pick(row, 'variantinventoryqty', 'inventoryqty');
      out.push({ sku, name: opt ? `${lastHandle.title}（${opt}）` : lastHandle.title, type: 'physical', price, description: lastHandle.body ? sanitizeHtml(lastHandle.body) : null, coverUrl: pick(row, 'variantimage') || lastHandle.image || null, stock: qty === '' ? null : toInt(qty), isActive: lastHandle.published, raw: r });
      continue;
    }
    const sku = pick(row, 'sku');
    const name = pick(row, 'name', 'title');
    const price = toInt(pick(row, 'price'));
    if (!sku || !name || !Number.isFinite(price)) continue;
    const typeRaw = pick(row, 'type').toLowerCase();
    const type = typeRaw === 'course' || typeRaw === 'credit_pack' ? typeRaw : 'physical';
    const stock = pick(row, 'stock', 'inventory', 'qty');
    const active = pick(row, 'active', 'is_active', 'published').toLowerCase();
    out.push({ sku, name, type, price, description: pick(row, 'description', 'body') ? sanitizeHtml(pick(row, 'description', 'body')) : null, coverUrl: pick(row, 'cover_url', 'image', 'image_src') || null, stock: stock === '' ? null : toInt(stock), isActive: active === '' ? true : !['false', '0', 'no', 'n'].includes(active), raw: r });
  }
  return out;
}

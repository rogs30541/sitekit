'use client';

/** 購物車只存在瀏覽器 localStorage（productId → qty）；金額一律由 api /orders/quote 計算，前端不自算。 */
export interface CartLine {
  productId: string;
  qty: number;
}
const KEY = 'sitekit.cart.v1';
const EVENT = 'sitekit:cart';

export function readCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as CartLine[]) : [];
    return Array.isArray(v) ? v.filter((l) => l && typeof l.productId === 'string' && Number.isInteger(l.qty) && l.qty > 0) : [];
  } catch {
    return [];
  }
}

export function writeCart(lines: CartLine[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines.filter((l) => l.qty > 0)));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function addToCart(productId: string, qty = 1) {
  const lines = readCart();
  const hit = lines.find((l) => l.productId === productId);
  if (hit) hit.qty = Math.min(99, hit.qty + qty);
  else lines.push({ productId, qty });
  writeCart(lines);
}

export function setQty(productId: string, qty: number) {
  writeCart(readCart().map((l) => (l.productId === productId ? { ...l, qty } : l)));
}

export function clearCart() {
  writeCart([]);
}

export function onCartChange(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

'use client';

import { useState } from 'react';
import { addToCart } from '@/lib/cart';
import { t } from '@/lib/i18n';

export interface VariantOption {
  id: string;
  name: string;
  price: number | null;
  stock: number | null;
}
const twd = (n: number) => `NT$ ${n.toLocaleString('zh-TW')}`;

/** 加入購物車；有多規格時先選規格（顯示規格價格與售完） */
export function AddToCartButton({ productId, variants = [], basePrice }: { productId: string; variants?: VariantOption[]; basePrice?: number }) {
  const [done, setDone] = useState(false);
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const v = variants.find((x) => x.id === variantId);
  const soldOut = !!v && v.stock === 0;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {variants.length ? (
        <select className="rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--line)' }} value={variantId} onChange={(e) => setVariantId(e.target.value)} aria-label={t('規格')}>
          {variants.map((x) => (
            <option key={x.id} value={x.id} disabled={x.stock === 0}>
              {x.name}
              {x.price !== null && x.price !== basePrice ? ` ${twd(x.price)}` : ''}
              {x.stock === 0 ? t('（售完）') : ''}
            </option>
          ))}
        </select>
      ) : null}
      <button
        disabled={soldOut}
        onClick={() => {
          addToCart(productId, 1, variants.length ? variantId : undefined);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
        className="rounded bg-black px-3 py-1.5 text-xs text-white disabled:opacity-40"
      >
        {soldOut ? t('售完') : done ? t('已加入') : t('加入購物車')}
      </button>
    </span>
  );
}

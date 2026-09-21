'use client';

import { useState } from 'react';
import { addToCart } from '@/lib/cart';

export function AddToCartButton({ productId }: { productId: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        addToCart(productId, 1);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="rounded bg-black px-3 py-1.5 text-xs text-white"
    >
      {done ? '已加入' : '加入購物車'}
    </button>
  );
}

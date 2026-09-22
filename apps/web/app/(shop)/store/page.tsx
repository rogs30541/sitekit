import Link from 'next/link';
import { Section } from '@/components/Section';
import { apiPublic, twd, type Product } from '@/lib/api-public';
import { AddToCartButton } from './AddToCartButton';

export const revalidate = 60;
export const metadata = { title: '商城', description: '實體商品與點數包' };

/** 商城：實體商品與點數包；課程在 /courses。加入購物車後到 /cart 結帳（可多件、折扣碼、運費）。 */
export default async function StorePage() {
  const products = (await apiPublic<Product[]>('/api/catalog/products')) ?? [];
  const goods = products.filter((p) => p.type !== 'course');
  return (
    <Section title="電商商城" group="(shop)">
      <p className="mb-4 text-xs" style={{ color: 'var(--muted)' }}>
        <Link href="/cart" className="underline">
          前往購物車
        </Link>
      </p>
      {goods.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goods.map((p) => (
            <li key={p.id} className="flex flex-col rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
              {p.coverUrl ? <img src={p.coverUrl} alt="" className="mb-2 aspect-[4/3] w-full rounded object-cover" /> : <div className="mb-2 aspect-[4/3] w-full rounded bg-neutral-100" />}
              <p className="font-semibold">{p.name}</p>
              {p.description ? (
                <p className="mt-1 line-clamp-3 text-xs" style={{ color: 'var(--muted)' }}>
                  {p.description.replace(/<[^>]+>/g, '')}
                </p>
              ) : null}
              <div className="mt-auto flex items-center justify-between pt-3">
                <span className="font-bold">{twd(p.price)}</span>
                {p.stock === 0 && !p.variants?.length ? <span className="text-xs text-red-700">售完</span> : <AddToCartButton productId={p.id} variants={p.variants ?? []} basePrice={p.price} />}
              </div>
              {p.stock !== null && p.stock !== undefined && p.stock > 0 && p.stock <= 5 ? <p className="mt-1 text-xs text-red-700">僅剩 {p.stock} 件</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ color: 'var(--muted)' }}>尚無上架商品。後台「商品管理」或 MCP `import_products` 匯入商品 CSV 後即顯示。</p>
      )}
    </Section>
  );
}

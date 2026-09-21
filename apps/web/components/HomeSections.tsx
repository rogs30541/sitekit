import Link from 'next/link';
import { apiPublic, twd, type CourseSummary, type PostList, type Product } from '@/lib/api-public';
import type { HomeSection } from '@/lib/site';

const A = ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) =>
  href.startsWith('/') ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <a href={href} className={className} target="_blank" rel="noopener">
      {children}
    </a>
  );

/** 首頁區塊渲染（後台「網站設定 → 首頁版面」）：hero／features／courses／products／posts／html／cta。 */
export async function HomeSections({ sections }: { sections: HomeSection[] }) {
  const needCourses = sections.some((s) => s.kind === 'courses');
  const needProducts = sections.some((s) => s.kind === 'products');
  const needPosts = sections.some((s) => s.kind === 'posts');
  const [courses, products, posts] = await Promise.all([
    needCourses ? apiPublic<CourseSummary[]>('/api/catalog/courses') : null,
    needProducts ? apiPublic<Product[]>('/api/catalog/products') : null,
    needPosts ? apiPublic<PostList>('/api/content/posts?limit=12') : null,
  ]);
  return (
    <div className="space-y-8">
      {sections.map((s, i) => {
        switch (s.kind) {
          case 'hero':
            return (
              <section key={i} className={`rounded-2xl border p-8 sm:p-12 ${s.align === 'left' ? 'text-left' : 'text-center'}`} style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
                {s.imageUrl ? <img src={s.imageUrl} alt="" className={`mb-6 max-h-72 w-full rounded-xl object-cover ${s.align === 'left' ? '' : 'mx-auto'}`} /> : null}
                <h1 className="text-3xl font-bold sm:text-4xl">{s.title}</h1>
                {s.subtitle ? (
                  <p className="mt-3 text-base sm:text-lg" style={{ color: 'var(--muted)' }}>
                    {s.subtitle}
                  </p>
                ) : null}
                {s.ctaText && s.ctaHref ? (
                  <A href={s.ctaHref} className="mt-6 inline-block rounded-lg px-6 py-3 text-sm font-semibold text-white" >
                    <span className="rounded-lg px-6 py-3" style={{ background: 'var(--accent)' }}>
                      {s.ctaText}
                    </span>
                  </A>
                ) : null}
              </section>
            );
          case 'features':
            return (
              <section key={i}>
                {s.title ? <h2 className="mb-4 text-2xl font-bold">{s.title}</h2> : null}
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(s.items ?? []).map((f, k) => (
                    <li key={k} className="rounded-xl border p-5" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
                      {f.icon ? <p className="text-2xl">{f.icon}</p> : null}
                      <p className="mt-1 font-semibold">{f.title}</p>
                      {f.text ? (
                        <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                          {f.text}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          case 'courses':
            return (
              <section key={i}>
                <h2 className="mb-4 text-2xl font-bold">{s.title || '精選課程'}</h2>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(courses ?? []).slice(0, s.limit ?? 3).map((c) => (
                    <li key={c.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
                      {c.product.coverUrl ? <img src={c.product.coverUrl} alt="" className="mb-3 aspect-video w-full rounded-lg object-cover" /> : null}
                      <Link href={`/course/${c.slug}`} className="font-semibold hover:underline">
                        {c.product.name}
                      </Link>
                      <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                        {c.summary ?? ''}
                      </p>
                      <p className="mt-2 font-bold">{c.product.price ? twd(c.product.price) : '免費'}</p>
                    </li>
                  ))}
                  {!courses?.length ? (
                    <li className="text-sm" style={{ color: 'var(--muted)' }}>
                      尚無上架課程
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          case 'products':
            return (
              <section key={i}>
                <h2 className="mb-4 text-2xl font-bold">{s.title || '熱門商品'}</h2>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {(products ?? [])
                    .filter((p) => p.type !== 'course')
                    .slice(0, s.limit ?? 3)
                    .map((p) => (
                      <li key={p.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
                        {p.coverUrl ? <img src={p.coverUrl} alt="" className="mb-3 aspect-[4/3] w-full rounded-lg object-cover" /> : null}
                        <p className="font-semibold">{p.name}</p>
                        <p className="mt-1 font-bold">{twd(p.price)}</p>
                        <Link href="/store" className="mt-2 inline-block text-sm underline">
                          前往商城
                        </Link>
                      </li>
                    ))}
                </ul>
              </section>
            );
          case 'posts':
            return (
              <section key={i}>
                <h2 className="mb-4 text-2xl font-bold">{s.title || '最新文章'}</h2>
                <ul className="space-y-2">
                  {(posts?.items ?? []).slice(0, s.limit ?? 3).map((p) => (
                    <li key={p.slug}>
                      <Link href={`/blog/${p.slug}`} className="font-semibold hover:underline">
                        {p.title}
                      </Link>
                      {p.excerpt ? (
                        <p className="text-sm" style={{ color: 'var(--muted)' }}>
                          {p.excerpt}
                        </p>
                      ) : null}
                    </li>
                  ))}
                  {!posts?.items.length ? (
                    <li className="text-sm" style={{ color: 'var(--muted)' }}>
                      尚無文章
                    </li>
                  ) : null}
                </ul>
              </section>
            );
          case 'html':
            return (
              <section key={i}>
                {s.title ? <h2 className="mb-4 text-2xl font-bold">{s.title}</h2> : null}
                <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: s.html ?? '' }} />
              </section>
            );
          case 'cta':
            return (
              <section key={i} className="rounded-2xl p-8 text-center text-white" style={{ background: 'var(--accent)' }}>
                <h2 className="text-2xl font-bold">{s.title}</h2>
                {s.text ? <p className="mt-2 opacity-90">{s.text}</p> : null}
                {s.buttonText && s.buttonHref ? (
                  <A href={s.buttonHref} className="mt-5 inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black">
                    {s.buttonText}
                  </A>
                ) : null}
              </section>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

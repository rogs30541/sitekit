import Link from 'next/link';
import type { NavItem } from './SiteNav';
import type { SiteConfig } from '@/lib/site';

/** 頁尾：頁尾選單（後台「網站架構 → 頁尾選單」）、聯絡資訊、社群連結、自訂文字、版權。 */
export function SiteFooter({ site, items }: { site: SiteConfig; items: NavItem[] }) {
  const b = site.brand;
  const social = [
    ['Facebook', b.social.facebook],
    ['Instagram', b.social.instagram],
    ['LINE', b.social.line],
    ['YouTube', b.social.youtube],
  ].filter(([, u]) => u);
  const flat = items.flatMap((n) => [n, ...n.children]);
  return (
    <footer className="mt-12 border-t" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 text-sm sm:grid-cols-3">
        <div>
          <p className="font-bold">{b.siteName}</p>
          {b.tagline ? (
            <p className="mt-1" style={{ color: 'var(--muted)' }}>
              {b.tagline}
            </p>
          ) : null}
          {b.footerText ? <p className="mt-2 whitespace-pre-wrap text-xs">{b.footerText}</p> : null}
        </div>
        <div>
          {flat.length ? (
            <ul className="space-y-1">
              {flat.map((n) =>
                n.href.startsWith('/') ? (
                  <li key={n.id}>
                    <Link href={n.href} className="hover:underline" target={n.newTab ? '_blank' : undefined}>
                      {n.label}
                    </Link>
                  </li>
                ) : (
                  <li key={n.id}>
                    <a href={n.href} className="hover:underline" target={n.newTab ? '_blank' : undefined} rel="noopener">
                      {n.label}
                    </a>
                  </li>
                ),
              )}
            </ul>
          ) : null}
        </div>
        <div className="space-y-1 text-xs" style={{ color: 'var(--muted)' }}>
          {b.contactEmail ? (
            <p>
              Email：
              <a href={`mailto:${b.contactEmail}`} className="underline">
                {b.contactEmail}
              </a>
            </p>
          ) : null}
          {b.phone ? <p>電話：{b.phone}</p> : null}
          {b.address ? <p>地址：{b.address}</p> : null}
          {social.length ? (
            <p className="flex flex-wrap gap-3 pt-1">
              {social.map(([label, href]) => (
                <a key={label} href={href} target="_blank" rel="noopener" className="underline">
                  {label}
                </a>
              ))}
            </p>
          ) : null}
        </div>
      </div>
      <p className="pb-6 text-center text-xs" style={{ color: 'var(--muted)' }}>
        © {new Date().getFullYear()} {b.name}
      </p>
    </footer>
  );
}

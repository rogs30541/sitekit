import Link from 'next/link';
import { apiPublic, twd, type CourseSummary, type PostList, type Product } from '@/lib/api-public';
import type { Section } from '@sitekit/shared';
import { t } from '@/lib/i18n';
import { Icon, SectionIcon } from './Icon';
import { ContactForm } from './ContactForm';

/**
 * 區塊渲染器：首頁（home.sections）與區塊頁（Content.design.kind='sections'）共用。
 * 20 種 kind × variant；資料型區塊（courses／products／posts）在伺服器端一次抓齊。
 * 版面只用主題 CSS 變數（--accent／--card／--line／--muted／--radius／--container），深淺色由 tone 決定。
 */
const A = ({ href, className, children, style }: { href: string; className?: string; children: React.ReactNode; style?: React.CSSProperties }) =>
  href.startsWith('/') ? (
    <Link href={href} className={className} style={style}>
      {children}
    </Link>
  ) : (
    <a href={href} className={className} style={style} target={href.startsWith('#') ? undefined : '_blank'} rel="noopener">
      {children}
    </a>
  );

const Btn = ({ href, children, ghost }: { href: string; children: React.ReactNode; ghost?: boolean }) => (
  <A href={href} className="inline-block px-6 py-3 text-sm font-semibold transition hover:opacity-90" style={ghost ? { border: '1px solid currentColor', borderRadius: 'var(--radius)' } : { background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 'var(--radius)' }}>
    {children}
  </A>
);

/** tone → 區塊底色與文字色（inline style，不依賴 Tailwind 主題） */
function toneStyle(tone: string, bgImageUrl?: string): React.CSSProperties {
  switch (tone) {
    case 'muted': return { background: 'var(--soft)' };
    case 'accent': return { background: 'var(--accent)', color: 'var(--on-accent)' };
    case 'dark': return { background: '#0b0b0d', color: '#f2f2f3', ['--card' as string]: '#151518', ['--line' as string]: '#26262b', ['--muted' as string]: '#a1a1aa', ['--soft' as string]: '#1d1d21' };
    case 'image': return { background: bgImageUrl ? `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.55)), url(${bgImageUrl}) center/cover` : 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#fff', ['--card' as string]: 'rgba(255,255,255,.08)', ['--line' as string]: 'rgba(255,255,255,.2)', ['--muted' as string]: 'rgba(255,255,255,.75)' };
    default: return {};
  }
}
const isFull = (tone: string) => tone !== 'default';

function Shell({ s, children, className = '' }: { s: Section; children: React.ReactNode; className?: string }) {
  const tone = (s as { tone?: string }).tone ?? 'default';
  const compact = (s as { compact?: boolean }).compact;
  const id = (s as { id?: string }).id || undefined;
  const tr = (s as { track?: string; trackPercent?: number }).track;
  const trackAttrs = tr ? { 'data-sk-track': tr, 'data-sk-track-percent': String((s as { trackPercent?: number }).trackPercent ?? 50), 'data-sk-track-once': '1', 'data-sk-track-label': s.kind } : {};
  const pad = compact ? 'py-8' : 'py-14 sm:py-20';
  if (isFull(tone))
    return (
      <section id={id} {...trackAttrs} className={`sk-full ${pad} ${className}`} style={toneStyle(tone, (s as { bgImageUrl?: string }).bgImageUrl)}>
        <div className="sk-container">{children}</div>
      </section>
    );
  return (
    <section id={id} {...trackAttrs} className={`${compact ? 'py-4' : 'py-6 sm:py-8'} ${className}`}>
      {children}
    </section>
  );
}

const Heading = ({ s, center = true }: { s: { kicker?: string; title?: string; subtitle?: string }; center?: boolean }) =>
  s.title || s.kicker || s.subtitle ? (
    <div className={`mb-8 ${center ? 'text-center' : ''}`}>
      {s.kicker ? <p className="mb-2 text-xs font-semibold uppercase tracking-[.2em]" style={{ color: 'var(--accent)' }}>{s.kicker}</p> : null}
      {s.title ? <h2 className="sk-h2">{s.title}</h2> : null}
      {s.subtitle ? <p className="mx-auto mt-3 max-w-2xl" style={{ color: 'var(--muted)' }}>{s.subtitle}</p> : null}
    </div>
  ) : null;

const Placeholder = ({ className = '', label = '' }: { className?: string; label?: string }) => (
  <div className={`flex items-center justify-center overflow-hidden ${className}`} style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 22%, var(--soft)), var(--soft))', borderRadius: 'var(--radius)' }} aria-hidden>
    {label ? <span className="text-xs" style={{ color: 'var(--muted)' }}>{label}</span> : null}
  </div>
);
const Img = ({ url, className = '', label }: { url?: string; className?: string; label?: string }) => (url ? <img src={url} alt="" className={`object-cover ${className}`} style={{ borderRadius: 'var(--radius)' }} /> : <Placeholder className={className} label={label} />);
const cols = (n: number) => ({ 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4', 5: 'sm:grid-cols-3 lg:grid-cols-5', 6: 'grid-cols-3 lg:grid-cols-6' })[n] ?? 'sm:grid-cols-3';
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`border p-5 ${className}`} style={{ borderColor: 'var(--line)', background: 'var(--card)', borderRadius: 'var(--radius)' }}>
    {children}
  </div>
);
const Video = ({ url, className = '' }: { url: string; className?: string }) => {
  const yt = url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{6,})/);
  if (yt) return <iframe className={`aspect-video w-full ${className}`} style={{ borderRadius: 'var(--radius)' }} src={`https://www.youtube.com/embed/${yt[1]}`} title="video" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />;
  if (url) return <video className={`w-full ${className}`} style={{ borderRadius: 'var(--radius)' }} src={url} controls playsInline />;
  return <Placeholder className={`aspect-video w-full ${className}`} label="影片" />;
};

export async function SectionRenderer({ sections }: { sections: Section[] }) {
  const need = (k: Section['kind']) => sections.some((s) => s.kind === k);
  const [courses, products, posts] = await Promise.all([
    need('courses') ? apiPublic<CourseSummary[]>('/api/catalog/courses') : null,
    need('products') ? apiPublic<Product[]>('/api/catalog/products') : null,
    need('posts') ? apiPublic<PostList>('/api/content/posts?limit=24') : null,
  ]);
  return (
    <div className="sk-sections">
      {sections.map((s, i) => (
        <Render key={i} s={s} courses={courses} products={products} posts={posts} />
      ))}
    </div>
  );
}

function Render({ s, courses, products, posts }: { s: Section; courses: CourseSummary[] | null; products: Product[] | null; posts: PostList | null }) {
  switch (s.kind) {
    case 'banner':
      return (
        <div className="sk-full px-4 py-2 text-center text-sm" style={s.tone === 'default' ? { background: 'var(--soft)' } : toneStyle(s.tone)}>
          {s.href ? <A href={s.href} className="hover:underline">{s.text}</A> : s.text}
        </div>
      );
    case 'hero': {
      const ctas = (
        <div className="mt-8 flex flex-wrap gap-3">
          {s.ctaText && s.ctaHref ? <Btn href={s.ctaHref}>{s.ctaText}</Btn> : null}
          {s.cta2Text && s.cta2Href ? <Btn href={s.cta2Href} ghost>{s.cta2Text}</Btn> : null}
        </div>
      );
      const title = <h1 className={s.variant === 'editorial' || s.variant === 'cover' ? 'sk-h1 sk-h1-xl whitespace-pre-line' : 'sk-h1 whitespace-pre-line'}>{s.title}</h1>;
      const kicker = s.kicker ? <p className="mb-3 text-xs font-semibold uppercase tracking-[.25em]" style={{ color: 'var(--accent)' }}>{s.kicker}</p> : null;
      const sub = s.subtitle ? <p className="mt-4 max-w-2xl text-lg" style={{ color: 'var(--muted)' }}>{s.subtitle}</p> : null;
      const highlights = s.highlights?.length ? (
        <div className={`mt-8 grid gap-3 ${cols(Math.min(4, s.highlights.length))}`}>
          {s.highlights.map((h, k) => (
            <Card key={k} className="!p-3 text-left text-sm">
              <span className="flex items-center gap-2 font-semibold"><SectionIcon icon={h.icon} size={18} style={{ color: 'var(--accent)' }} />{h.title}</span>
              {h.text ? <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{h.text}</p> : null}
            </Card>
          ))}
        </div>
      ) : null;
      const inner = (() => {
        switch (s.variant) {
          case 'split': {
            const media = s.videoUrl ? <Video url={s.videoUrl} /> : <Img url={s.imageUrl} className="aspect-[4/3] w-full" label="主視覺" />;
            return (
              <div className={`grid items-center gap-10 lg:grid-cols-2 ${s.imageSide === 'left' ? 'lg:[&>*:first-child]:order-2' : ''}`}>
                <div>{kicker}{title}{sub}{ctas}{highlights}</div>
                {media}
              </div>
            );
          }
          case 'left':
            return (
              <div className="max-w-3xl text-left">{kicker}{title}{sub}{ctas}{highlights}{s.imageUrl ? <Img url={s.imageUrl} className="mt-8 max-h-96 w-full" /> : null}</div>
            );
          case 'dashboard':
            return (
              <div className="text-center">{kicker}<h1 className="sk-h1">{s.title}</h1>{sub ? <div className="mx-auto max-w-xl">{sub}</div> : null}{ctas}</div>
            );
          case 'carousel': {
            const slides = s.slides?.length ? s.slides : [{ title: s.title, subtitle: s.subtitle, imageUrl: s.imageUrl, ctaText: s.ctaText, ctaHref: s.ctaHref }];
            return (
              <div className="sk-carousel flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
                {slides.map((sl, k) => (
                  <div key={k} className="relative min-w-full snap-center overflow-hidden" style={{ borderRadius: 'var(--radius)' }}>
                    <Img url={sl.imageUrl} className="aspect-[21/9] w-full" label="輪播圖" />
                    <div className="absolute inset-0 flex flex-col justify-center p-8 sm:p-12" style={{ background: 'linear-gradient(90deg, rgba(0,0,0,.55), rgba(0,0,0,0))', color: '#fff' }}>
                      <h2 className="sk-h1">{sl.title}</h2>
                      {sl.subtitle ? <p className="mt-2 max-w-lg opacity-90">{sl.subtitle}</p> : null}
                      {sl.ctaText && sl.ctaHref ? <div className="mt-5"><Btn href={sl.ctaHref}>{sl.ctaText}</Btn></div> : null}
                    </div>
                  </div>
                ))}
              </div>
            );
          }
          case 'cover':
          case 'editorial':
            return <div className="min-h-[60vh] flex flex-col justify-center">{kicker}{title}{sub}{ctas}{highlights}</div>;
          default:
            return (
              <div className="text-center">{kicker}{title}{sub ? <div className="mx-auto max-w-2xl">{sub}</div> : null}<div className="flex justify-center">{ctas}</div>{highlights}{s.imageUrl ? <Img url={s.imageUrl} className="mx-auto mt-10 max-h-[28rem] w-full" /> : null}</div>
            );
        }
      })();
      const tone = s.tone === 'default' && (s.variant === 'cover' || s.variant === 'editorial') ? 'muted' : s.tone;
      return <Shell s={{ ...s, tone } as Section}>{inner}</Shell>;
    }
    case 'stats':
      return (
        <Shell s={s}>
          <Heading s={s} />
          {s.variant === 'cards' ? (
            <div className={`grid gap-4 ${cols(Math.min(4, s.items.length))}`}>
              {s.items.map((it, k) => (
                <Card key={k}>
                  <p className="sk-stat" style={{ color: 'var(--accent)' }}>{it.value}</p>
                  <p className="mt-1 font-semibold">{it.label}</p>
                  {it.note ? <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{it.note}</p> : null}
                </Card>
              ))}
            </div>
          ) : (
            <div className={`flex flex-wrap ${s.variant === 'inline' ? 'gap-x-12 gap-y-6' : 'justify-around gap-8 text-center'}`}>
              {s.items.map((it, k) => (
                <div key={k}>
                  <p className="sk-stat">{it.value}</p>
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>{it.label}</p>
                  {it.note ? <p className="text-xs" style={{ color: 'var(--muted)' }}>{it.note}</p> : null}
                </div>
              ))}
            </div>
          )}
        </Shell>
      );
    case 'features': {
      const body = (() => {
        switch (s.variant) {
          case 'list':
            return (
              <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
                {s.items.map((it, k) => (
                  <li key={k} className="flex items-start gap-4 py-5" style={{ borderColor: 'var(--line)' }}>
                    {it.icon ? <SectionIcon icon={it.icon} size={26} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} /> : null}
                    <div className="flex-1">
                      <p className="text-lg font-semibold">{it.title}</p>
                      {it.text ? <p className="mt-1" style={{ color: 'var(--muted)' }}>{it.text}</p> : null}
                    </div>
                    {it.href ? <A href={it.href} className="flex items-center gap-1 text-sm underline">{it.ctaText || <Icon name="arrow-right" size={16} />}</A> : null}
                  </li>
                ))}
              </ul>
            );
          case 'tabs':
            return (
              <div className={`grid gap-3 ${cols(Math.min(4, s.items.length))}`}>
                {s.items.map((it, k) => (
                  <A key={k} href={it.href || '#'} className="block border p-4 text-center transition hover:opacity-90" style={{ borderColor: k === 0 ? 'var(--accent)' : 'var(--line)', background: 'var(--card)', borderRadius: 'var(--radius)' }}>
                    <p className="font-semibold">{it.title}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-widest" style={{ color: 'var(--muted)' }}>{[it.code, it.tag].filter(Boolean).join(' · ')}</p>
                  </A>
                ))}
              </div>
            );
          case 'numbered':
            return (
              <div className={`grid gap-6 ${cols(s.columns)}`}>
                {s.items.map((it, k) => (
                  <div key={k}>
                    <p className="text-sm font-bold" style={{ color: 'var(--accent)' }}>{it.code || String(k + 1).padStart(2, '0')}</p>
                    <p className="mt-2 text-xl font-bold">{it.title}</p>
                    {it.text ? <p className="mt-2" style={{ color: 'var(--muted)' }}>{it.text}</p> : null}
                  </div>
                ))}
              </div>
            );
          case 'icons':
            return (
              <div className={`grid gap-8 text-center ${cols(s.columns)}`}>
                {s.items.map((it, k) => (
                  <div key={k}>
                    <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center" style={{ background: 'var(--soft)', borderRadius: 'var(--radius)', color: 'var(--accent)' }}><SectionIcon icon={it.icon} fallback="sparkles" size={26} /></div>
                    <p className="font-semibold">{it.title}</p>
                    {it.text ? <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{it.text}</p> : null}
                  </div>
                ))}
              </div>
            );
          default:
            return (
              <div className={`grid gap-4 ${cols(s.columns)}`}>
                {s.items.map((it, k) => (
                  <Card key={k} className="flex flex-col">
                    {it.code || it.tag ? <p className="mb-2 text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>{it.code}{it.tag && !it.code ? it.tag : ''}</p> : null}
                    {it.icon ? <div className="mb-3 flex h-11 w-11 items-center justify-center" style={{ background: 'var(--soft)', borderRadius: 'var(--radius)', color: 'var(--accent)' }}><SectionIcon icon={it.icon} size={22} /></div> : null}
                    <p className="mt-1 text-lg font-semibold">{it.title}</p>
                    {it.text ? <p className="mt-1 flex-1 text-sm" style={{ color: 'var(--muted)' }}>{it.text}</p> : null}
                    {it.href ? <div className="mt-4"><Btn href={it.href}>{it.ctaText || t('前往')}</Btn></div> : null}
                  </Card>
                ))}
              </div>
            );
        }
      })();
      return <Shell s={s}><Heading s={s} />{body}</Shell>;
    }
    case 'split': {
      const media = s.videoUrl ? <Video url={s.videoUrl} className={s.sticky ? 'aspect-[9/16] max-w-xs' : ''} /> : <Img url={s.imageUrl} className={s.sticky ? 'aspect-[9/16] w-full max-w-xs' : 'aspect-[4/3] w-full'} label="圖片" />;
      return (
        <Shell s={s}>
          <div className={`grid items-start gap-10 lg:grid-cols-2 ${s.imageSide === 'left' ? 'lg:[&>*:first-child]:order-2' : ''}`}>
            <div>
              <Heading s={s} center={false} />
              {s.text ? <div className="space-y-3 whitespace-pre-line leading-relaxed" style={{ color: 'var(--muted)' }}>{s.text}</div> : null}
              {s.bullets?.length ? (
                <ul className="mt-5 space-y-3">
                  {s.bullets.map((b, k) => (
                    <li key={k} className="flex gap-3 border-b pb-3" style={{ borderColor: 'var(--line)' }}>
                      <Icon name="check" size={18} className="mt-1 shrink-0" style={{ color: 'var(--accent)' }} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {s.ctaText && s.ctaHref ? <div className="mt-6 flex gap-3"><Btn href={s.ctaHref}>{s.ctaText}</Btn>{s.cta2Text && s.cta2Href ? <Btn href={s.cta2Href} ghost>{s.cta2Text}</Btn> : null}</div> : null}
            </div>
            <div className={s.sticky ? 'lg:sticky lg:top-24 flex justify-center' : ''}>{media}</div>
          </div>
        </Shell>
      );
    }
    case 'gallery': {
      const items = s.items.length ? s.items : Array.from({ length: s.variant === 'strip' ? 4 : Math.max(6, s.columns * 2) }, () => ({ imageUrl: '', caption: '', href: '' }));
      return (
        <Shell s={s}>
          <Heading s={s} />
          {s.variant === 'strip' ? (
            <div className="flex snap-x gap-4 overflow-x-auto pb-2">
              {items.map((it, k) => <div key={k} className="min-w-[70%] snap-start sm:min-w-[40%] lg:min-w-[30%]"><Img url={it.imageUrl} className="aspect-[4/3] w-full" label={it.caption || '圖片'} /></div>)}
            </div>
          ) : s.variant === 'masonry' ? (
            <div className={`columns-2 gap-4 lg:columns-${Math.min(4, s.columns)}`}>
              {items.map((it, k) => <div key={k} className="mb-4 break-inside-avoid"><Img url={it.imageUrl} className={`w-full ${k % 3 === 1 ? 'aspect-[3/4]' : 'aspect-square'}`} label={it.caption || '作品'} /></div>)}
            </div>
          ) : (
            <div className={`grid gap-4 ${cols(s.columns)}`}>
              {items.map((it, k) => (
                <figure key={k}>
                  {it.href ? <A href={it.href}><Img url={it.imageUrl} className="aspect-square w-full" label={it.caption || '作品'} /></A> : <Img url={it.imageUrl} className="aspect-square w-full" label={it.caption || '作品'} />}
                  {it.caption ? <figcaption className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>{it.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          )}
        </Shell>
      );
    }
    case 'testimonials':
      return (
        <Shell s={s}>
          <Heading s={s} />
          {s.variant === 'single' ? (
            <blockquote className="mx-auto max-w-3xl text-center">
              <p className="text-2xl font-medium leading-relaxed">「{s.items[0]?.quote}」</p>
              <footer className="mt-4 text-sm" style={{ color: 'var(--muted)' }}>{s.items[0]?.name}{s.items[0]?.role ? ` · ${s.items[0].role}` : ''}</footer>
            </blockquote>
          ) : (
            <div className={`grid gap-4 ${s.variant === 'wall' ? 'sm:grid-cols-2 lg:grid-cols-3' : cols(Math.min(4, Math.max(2, s.items.length)))}`}>
              {s.items.map((it, k) => (
                <Card key={k} className={s.variant === 'quotes' ? '!border-0 !bg-transparent !p-0' : ''}>
                  {it.metric ? <p className="mb-2 text-sm font-bold" style={{ color: 'var(--accent)' }}>{it.metric}</p> : null}
                  <p className="leading-relaxed">「{it.quote}」</p>
                  <div className="mt-4 flex items-center gap-3 text-sm">
                    {it.avatarUrl ? <img src={it.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs" style={{ background: 'var(--soft)' }}>{it.name.slice(0, 1)}</span>}
                    <span><span className="font-semibold">{it.name}</span>{it.role ? <span style={{ color: 'var(--muted)' }}> · {it.role}</span> : null}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Shell>
      );
    case 'faq':
      return (
        <Shell s={s}>
          <Heading s={s} />
          <div className="mx-auto max-w-3xl divide-y" style={{ borderColor: 'var(--line)' }}>
            {s.items.map((it, k) => (
              <details key={k} className="group py-4" style={{ borderColor: 'var(--line)' }}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">{it.q}<Icon name="plus" size={18} className="shrink-0 transition group-open:rotate-45" style={{ color: 'var(--muted)' }} /></summary>
                <p className="mt-2 whitespace-pre-line" style={{ color: 'var(--muted)' }}>{it.a}</p>
              </details>
            ))}
          </div>
        </Shell>
      );
    case 'pricing':
      return (
        <Shell s={s}>
          <Heading s={s} />
          <div className={`grid gap-4 ${cols(Math.min(4, s.plans.length))}`}>
            {s.plans.map((p, k) => (
              <Card key={k} className={`flex flex-col ${p.highlight ? 'ring-2' : ''}`}>
                {p.highlight ? <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>{t('推薦')}</p> : null}
                <p className="text-lg font-semibold">{p.name}</p>
                <p className="mt-2"><span className="sk-stat">{p.price}</span>{p.period ? <span className="text-sm" style={{ color: 'var(--muted)' }}> {p.period}</span> : null}</p>
                {p.note ? <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{p.note}</p> : null}
                {p.features?.length ? <ul className="mt-4 flex-1 space-y-2 text-sm">{p.features.map((f, j) => <li key={j} className="flex items-start gap-2"><Icon name="check" size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />{f}</li>)}</ul> : <div className="flex-1" />}
                {p.ctaText && p.ctaHref ? <div className="mt-5"><Btn href={p.ctaHref} ghost={!p.highlight}>{p.ctaText}</Btn></div> : null}
              </Card>
            ))}
          </div>
        </Shell>
      );
    case 'steps':
      return (
        <Shell s={s}>
          <Heading s={s} />
          {s.variant === 'timeline' ? (
            <ol className="relative mx-auto max-w-2xl border-l pl-6" style={{ borderColor: 'var(--line)' }}>
              {s.items.map((it, k) => (
                <li key={k} className="relative mb-6">
                  <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full" style={{ background: 'var(--accent)' }} />
                  <p className="font-semibold">{it.title}</p>
                  {it.text ? <p className="text-sm" style={{ color: 'var(--muted)' }}>{it.text}</p> : null}
                </li>
              ))}
            </ol>
          ) : (
            <div className={`grid gap-4 ${cols(Math.min(4, s.items.length))}`}>
              {s.items.map((it, k) => (
                <div key={k} className={s.variant === 'cards' ? 'border p-5' : ''} style={s.variant === 'cards' ? { borderColor: 'var(--line)', background: 'var(--card)', borderRadius: 'var(--radius)' } : {}}>
                  <p className="text-3xl font-black" style={{ color: 'var(--accent)' }}>{String(k + 1).padStart(2, '0')}</p>
                  <p className="mt-2 font-semibold">{it.title}</p>
                  {it.text ? <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{it.text}</p> : null}
                </div>
              ))}
            </div>
          )}
        </Shell>
      );
    case 'team':
      return (
        <Shell s={s}>
          <Heading s={s} />
          {s.variant === 'founder' ? (
            <div className="grid items-center gap-8 lg:grid-cols-[2fr_3fr]">
              <Img url={s.members[0]?.avatarUrl} className="aspect-[4/5] w-full" label="創辦人" />
              <div><p className="text-xs uppercase tracking-widest" style={{ color: 'var(--accent)' }}>{s.members[0]?.role}</p><p className="mt-2 text-3xl font-bold">{s.members[0]?.name}</p><p className="mt-4 whitespace-pre-line leading-relaxed" style={{ color: 'var(--muted)' }}>{s.members[0]?.bio}</p></div>
            </div>
          ) : s.variant === 'list' ? (
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {s.members.map((m, k) => (
                <li key={k} className="flex gap-4 py-5" style={{ borderColor: 'var(--line)' }}>
                  {m.avatarUrl ? <img src={m.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" /> : <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg" style={{ background: 'var(--soft)' }}>{m.name.slice(0, 1)}</span>}
                  <div><p className="font-semibold">{m.name}{m.role ? <span className="ml-2 text-sm" style={{ color: 'var(--muted)' }}>{m.role}</span> : null}</p>{m.bio ? <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{m.bio}</p> : null}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className={`grid gap-6 text-center ${cols(Math.min(4, Math.max(2, s.members.length)))}`}>
              {s.members.map((m, k) => (
                <div key={k}>
                  <Img url={m.avatarUrl} className="mx-auto aspect-square w-full max-w-[12rem]" label={m.name} />
                  <p className="mt-3 font-semibold">{m.name}</p>
                  {m.role ? <p className="text-sm" style={{ color: 'var(--muted)' }}>{m.role}</p> : null}
                  {m.bio ? <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>{m.bio}</p> : null}
                </div>
              ))}
            </div>
          )}
        </Shell>
      );
    case 'logos':
      return (
        <Shell s={s}>
          <Heading s={s} />
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 opacity-80">
            {s.items.map((it, k) => (it.imageUrl ? <img key={k} src={it.imageUrl} alt={it.name} className="h-8 w-auto grayscale" /> : <span key={k} className="text-sm font-semibold tracking-wider" style={{ color: 'var(--muted)' }}>{it.name}</span>))}
          </div>
        </Shell>
      );
    case 'video':
      return (
        <Shell s={s}>
          <Heading s={s} />
          <div className="mx-auto max-w-4xl"><Video url={s.videoUrl} />{s.text ? <p className="mt-4 text-center" style={{ color: 'var(--muted)' }}>{s.text}</p> : null}</div>
        </Shell>
      );
    case 'cta': {
      const btn = (s.buttonText && s.buttonHref) || (s.ctaText && s.ctaHref);
      const href = s.buttonHref || s.ctaHref;
      const label = s.buttonText || s.ctaText;
      if (s.variant === 'split')
        return (
          <Shell s={s}>
            <div className="flex flex-wrap items-center justify-between gap-6 border p-8" style={{ borderColor: 'var(--line)', background: 'var(--card)', borderRadius: 'var(--radius)' }}>
              <div><h2 className="sk-h2">{s.title}</h2>{s.text ? <p className="mt-2" style={{ color: 'var(--muted)' }}>{s.text}</p> : null}</div>
              {btn ? <Btn href={href}>{label}</Btn> : null}
            </div>
          </Shell>
        );
      const tone = s.variant === 'band' ? 'accent' : s.tone;
      return (
        <Shell s={{ ...s, tone: tone === 'default' ? 'muted' : tone } as Section}>
          <div className="text-center">
            <h2 className="sk-h2">{s.title}</h2>
            {s.text ? <p className="mx-auto mt-2 max-w-2xl opacity-90">{s.text}</p> : null}
            {btn ? <div className="mt-6"><A href={href} className="inline-block px-6 py-3 text-sm font-semibold" style={{ background: tone === 'accent' ? 'var(--on-accent)' : 'var(--accent)', color: tone === 'accent' ? 'var(--accent)' : 'var(--on-accent)', borderRadius: 'var(--radius)' }}>{label}</A></div> : null}
          </div>
        </Shell>
      );
    }
    case 'contact':
      return (
        <Shell s={s}>
          <Heading s={s} />
          <div className={s.variant === 'map' ? 'grid gap-6 lg:grid-cols-2' : ''}>
            {s.variant === 'map' ? (s.mapEmbedUrl ? <iframe src={s.mapEmbedUrl} className="aspect-[4/3] w-full" style={{ borderRadius: 'var(--radius)', border: 0 }} loading="lazy" title="map" /> : <Placeholder className="aspect-[4/3] w-full" label="地圖" />) : null}
            <div className={s.variant === 'cards' ? `grid gap-4 ${cols(Math.min(3, Math.max(1, s.items.length)))}` : 'space-y-3'}>
              {s.items.map((it, k) =>
                s.variant === 'cards' ? (
                  <Card key={k} className="text-center">
                    <div className="flex justify-center" style={{ color: 'var(--accent)' }}><SectionIcon icon={it.icon} size={26} /></div>
                    <p className="mt-2 text-xs uppercase tracking-widest" style={{ color: 'var(--muted)' }}>{it.label}</p>
                    <p className="mt-1 font-semibold">{it.href ? <A href={it.href} className="hover:underline">{it.value}</A> : it.value}</p>
                  </Card>
                ) : (
                  <p key={k} className="flex items-start gap-3"><SectionIcon icon={it.icon} size={18} className="mt-1 shrink-0" style={{ color: 'var(--accent)' }} /><span className="w-20 shrink-0" style={{ color: 'var(--muted)' }}>{it.label}</span>{it.href ? <A href={it.href} className="underline">{it.value}</A> : <span>{it.value}</span>}</p>
                ),
              )}
            </div>
          </div>
          {s.showForm ? (
            <div className={`mx-auto mt-8 ${s.variant === 'map' ? '' : 'max-w-2xl'}`}>
              <ContactForm />
            </div>
          ) : null}
        </Shell>
      );
    case 'categories':
      return (
        <Shell s={s}>
          <Heading s={s} />
          {s.variant === 'chips' ? (
            <div className="flex flex-wrap justify-center gap-2">
              {s.items.map((it, k) => <A key={k} href={it.href || '#'} className="inline-flex items-center gap-1.5 border px-4 py-1.5 text-sm hover:opacity-80" style={{ borderColor: 'var(--line)', background: 'var(--card)', borderRadius: '999px' }}><SectionIcon icon={it.icon} size={16} />{it.title}{it.count ? <span style={{ color: 'var(--muted)' }}> {it.count}</span> : null}</A>)}
            </div>
          ) : (
            <div className={`grid gap-4 ${cols(s.columns)}`}>
              {s.items.map((it, k) => (
                <A key={k} href={it.href || '#'} className="block overflow-hidden border text-center transition hover:opacity-90" style={{ borderColor: 'var(--line)', background: 'var(--card)', borderRadius: 'var(--radius)' }}>
                  {s.variant === 'tiles' ? <Img url={it.imageUrl} className="aspect-[4/3] w-full !rounded-none" label={it.title} /> : <div className="flex justify-center pt-6" style={{ color: 'var(--accent)' }}><SectionIcon icon={it.icon} fallback="sparkles" size={30} /></div>}
                  <p className="p-3 font-semibold">{it.title}{it.count ? <span className="ml-1 text-xs" style={{ color: 'var(--muted)' }}>{it.count}</span> : null}</p>
                </A>
              ))}
            </div>
          )}
        </Shell>
      );
    case 'courses': {
      const list = (courses ?? []).slice(0, s.limit);
      return (
        <Shell s={s}>
          <div className="mb-6 flex items-end justify-between gap-4"><div><h2 className="sk-h2">{s.title || t('精選課程')}</h2>{s.subtitle ? <p style={{ color: 'var(--muted)' }}>{s.subtitle}</p> : null}</div>{s.ctaText && s.ctaHref ? <A href={s.ctaHref} className="text-sm underline">{s.ctaText}</A> : null}</div>
          {!list.length ? <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('尚無上架課程')}</p> : null}
          <ul className={s.variant === 'list' ? 'divide-y' : s.variant === 'strip' ? 'flex snap-x gap-4 overflow-x-auto pb-2' : `grid gap-4 ${cols(s.columns)}`} style={{ borderColor: 'var(--line)' }}>
            {list.map((c, k) => (
              <li key={c.id} className={s.variant === 'list' ? 'flex gap-4 py-4' : s.variant === 'strip' ? 'min-w-[70%] snap-start sm:min-w-[45%] lg:min-w-[23%]' : ''} style={{ borderColor: 'var(--line)' }}>
                <div className={s.variant === 'list' ? 'flex w-full gap-4' : 'flex h-full flex-col border p-3'} style={s.variant === 'list' ? {} : { borderColor: 'var(--line)', background: 'var(--card)', borderRadius: 'var(--radius)' }}>
                  <div className={`relative ${s.variant === 'list' ? 'w-40 shrink-0' : ''}`}>
                    {s.variant === 'ranking' ? <span className="absolute left-2 top-2 z-10 px-2 py-0.5 text-xs font-bold text-white" style={{ background: 'var(--accent)', borderRadius: 'var(--radius)' }}>No.{k + 1}</span> : null}
                    <Img url={c.product.coverUrl ?? ''} className={`w-full ${s.variant === 'ranking' ? 'aspect-[3/4]' : 'aspect-video'}`} label={c.product.name} />
                  </div>
                  <div className="mt-3 flex flex-1 flex-col">
                    <Link href={`/course/${c.slug}`} className="font-semibold hover:underline">{c.product.name}</Link>
                    {c.summary ? <p className="mt-1 line-clamp-2 text-sm" style={{ color: 'var(--muted)' }}>{c.summary}</p> : null}
                    {s.variant === 'progress' ? (
                      <div className="mt-3"><div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--soft)' }}><div className="h-full" style={{ width: `${Math.min(100, 30 + (k * 23) % 70)}%`, background: 'var(--accent)' }} /></div><p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{t('募資中')}</p></div>
                    ) : null}
                    <p className="mt-auto pt-2 font-bold">{c.product.price ? twd(c.product.price) : t('免費')}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Shell>
      );
    }
    case 'products': {
      const list = (products ?? []).filter((p) => p.type !== 'course').slice(0, s.limit);
      return (
        <Shell s={s}>
          <div className="mb-6 flex items-end justify-between gap-4"><div><h2 className="sk-h2">{s.title || t('熱門商品')}</h2>{s.subtitle ? <p style={{ color: 'var(--muted)' }}>{s.subtitle}</p> : null}</div>{s.ctaText && s.ctaHref ? <A href={s.ctaHref} className="text-sm underline">{s.ctaText}</A> : null}</div>
          {!list.length ? <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('尚無上架商品。後台「商品管理」或 MCP `import_products` 匯入商品 CSV 後即顯示。')}</p> : null}
          <ul className={s.variant === 'list' ? 'divide-y' : s.variant === 'strip' ? 'flex snap-x gap-4 overflow-x-auto pb-2' : `grid gap-4 ${cols(s.columns)}`} style={{ borderColor: 'var(--line)' }}>
            {list.map((p, k) => (
              <li key={p.id} className={s.variant === 'list' ? 'flex gap-4 py-4' : s.variant === 'strip' ? 'min-w-[60%] snap-start sm:min-w-[40%] lg:min-w-[23%]' : ''} style={{ borderColor: 'var(--line)' }}>
                <div className={s.variant === 'list' ? 'flex w-full gap-4' : s.variant === 'featured' && k === 0 ? 'sm:col-span-2' : ''}>
                  <div className={`relative ${s.variant === 'list' ? 'w-32 shrink-0' : ''}`}>
                    {s.variant === 'ranking' ? <span className="absolute left-2 top-2 z-10 px-2 py-0.5 text-xs font-bold text-white" style={{ background: 'var(--accent)', borderRadius: 'var(--radius)' }}>No.{k + 1}</span> : null}
                    <Link href="/store"><Img url={p.coverUrl ?? ''} className="aspect-square w-full" label={p.name} /></Link>
                  </div>
                  <div className="mt-2"><Link href="/store" className="font-semibold hover:underline">{p.name}</Link><p className="mt-1 font-bold">{twd(p.price)}</p></div>
                </div>
              </li>
            ))}
          </ul>
        </Shell>
      );
    }
    case 'posts': {
      const list = (posts?.items ?? []).slice(0, s.limit);
      return (
        <Shell s={s}>
          <div className="mb-6 flex items-end justify-between gap-4"><div><h2 className="sk-h2">{s.title || t('最新文章')}</h2>{s.subtitle ? <p style={{ color: 'var(--muted)' }}>{s.subtitle}</p> : null}</div>{s.ctaText && s.ctaHref ? <A href={s.ctaHref} className="text-sm underline">{s.ctaText}</A> : null}</div>
          {!list.length ? <p className="text-sm" style={{ color: 'var(--muted)' }}>{t('尚無文章')}</p> : null}
          {s.variant === 'grid' || s.variant === 'featured' ? (
            <ul className={`grid gap-4 ${cols(s.columns)}`}>
              {list.map((p) => (
                <li key={p.slug}>
                  <Card className="h-full">
                    <Link href={`/blog/${p.slug}`} className="text-lg font-semibold hover:underline">{p.title}</Link>
                    {p.excerpt ? <p className="mt-2 line-clamp-3 text-sm" style={{ color: 'var(--muted)' }}>{p.excerpt}</p> : null}
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {list.map((p) => (
                <li key={p.slug} className="py-3" style={{ borderColor: 'var(--line)' }}>
                  <Link href={`/blog/${p.slug}`} className="font-semibold hover:underline">{p.title}</Link>
                  {p.excerpt ? <p className="text-sm" style={{ color: 'var(--muted)' }}>{p.excerpt}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Shell>
      );
    }
    case 'html':
      return (
        <Shell s={s}>
          {s.title ? <h2 className="sk-h2 mb-4">{s.title}</h2> : null}
          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: s.html ?? '' }} />
        </Shell>
      );
    default:
      return null;
  }
}

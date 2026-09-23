'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ADMIN_NAV } from './admin-nav-data';

const groupOf = (pathname: string, search: string) => {
  const full = pathname + search;
  for (const g of ADMIN_NAV) for (const i of g.items) if (full.startsWith(i.href.split('?')[0]) && (!i.href.includes('?') || full.includes(i.href.split('?')[1]))) return g.key;
  return '';
};

export function AdminNav() {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSearch(typeof window !== 'undefined' ? window.location.search : '');
    setOpen(null);
  }, [pathname]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const active = groupOf(pathname, search);
  return (
    <div ref={ref} className="flex flex-wrap items-center gap-1">
      {ADMIN_NAV.map((g) => (
        <div key={g.key} className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === g.key ? null : g.key)}
            onMouseEnter={() => setOpen(g.key)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${active === g.key ? 'bg-black text-white' : 'hover:bg-neutral-100'}`}
            aria-expanded={open === g.key}
          >
            {g.label} <span className="opacity-60">▾</span>
          </button>
          {open === g.key ? (
            <div onMouseLeave={() => setOpen(null)} className="absolute left-0 z-30 mt-1 min-w-52 rounded-lg border p-1.5 shadow-lg" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
              {g.items.map((i) => {
                const cur = (pathname + search).startsWith(i.href.split('?')[0]) && (!i.href.includes('?') || search.includes(i.href.split('?')[1]));
                return (
                  <Link key={i.href} href={i.href} className={`block rounded px-2 py-1.5 text-xs hover:bg-neutral-100 ${cur ? 'font-bold' : ''}`}>
                    {i.label}
                    {i.desc ? (
                      <span className="block text-[10px] font-normal" style={{ color: 'var(--muted)' }}>
                        {i.desc}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

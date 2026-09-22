'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export interface AdminNavGroup {
  key: string;
  label: string;
  items: { href: string; label: string; desc?: string }[];
}

/** 後台五大分類選單：網站／電商／課程／AI 工作站／系統功能（點擊展開；目前頁面所在分類高亮） */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    key: 'site',
    label: '網站',
    items: [
      { href: '/admin/content?type=page', label: '頁面設計', desc: '視覺設計器／草稿／沙盒預覽／發佈／版本' },
      { href: '/admin/content?type=post', label: '文章', desc: '部落格文章' },
      { href: '/admin/menu', label: '網站架構', desc: '主選單／頁尾選單（拖曳）' },
      { href: '/admin/site', label: '網站設定', desc: '品牌／SEO／GA／首頁區塊' },
    ],
  },
  {
    key: 'shop',
    label: '電商',
    items: [
      { href: '/admin/products', label: '商品' },
      { href: '/admin/orders', label: '訂單' },
      { href: '/admin/coupons', label: '折扣碼' },
      { href: '/admin/reports', label: '報表' },
      { href: '/admin/payments', label: '金流' },
      { href: '/admin/shipping', label: '物流' },
      { href: '/admin/invoice', label: '發票' },
    ],
  },
  { key: 'learn', label: '課程', items: [{ href: '/admin/courses', label: '課程管理' }] },
  { key: 'ai', label: 'AI 工作站', items: [{ href: '/admin/studio', label: 'AI 工作站' }] },
  {
    key: 'system',
    label: '系統功能',
    items: [
      { href: '/admin', label: '總覽' },
      { href: '/admin/integrations', label: '儲存與通知' },
      { href: '/admin/accounts', label: '管理員' },
    ],
  },
];

const groupOf = (pathname: string, search: string) => {
  const full = pathname + search;
  for (const g of ADMIN_NAV) for (const i of g.items) if (i.href !== '/admin' && full.startsWith(i.href.split('?')[0]) && (!i.href.includes('?') || full.includes(i.href.split('?')[1]))) return g.key;
  return pathname === '/admin' ? 'system' : '';
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
                const cur = (pathname + search).startsWith(i.href.split('?')[0]) && (!i.href.includes('?') || search.includes(i.href.split('?')[1])) && (i.href !== '/admin' || pathname === '/admin');
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

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export interface AdminNavGroup {
  key: string;
  label: string;
  items: { href: string; label: string; desc?: string }[];
}

/** 後台大分類選單：網站／帳務／電商／課程／會員資料庫／AI 工作站／系統功能（點擊展開；目前頁面所在分類高亮） */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    key: 'site',
    label: '網站',
    items: [
      { href: '/admin/site', label: '網站設定', desc: '品牌／SEO／追蹤設定（全站）／首頁區塊' },
      { href: '/admin/menu', label: '網站架構', desc: '主選單／頁尾選單（拖曳）' },
      { href: '/admin/content', label: '新增網頁', desc: '視覺設計器／草稿／沙盒預覽／發佈／版本' },
      { href: '/admin/sales', label: '一頁式網頁', desc: '通知／倒數／內文／產品與課程區塊／表單／順序／追蹤' },
      { href: '/admin/posts', label: '文章', desc: '部落格文章（/blog）' },
    ],
  },
  {
    key: 'finance',
    label: '帳務',
    items: [
      { href: '/admin/payments', label: '金流', desc: '全站共用：藍新／統一／綠界／LINE Pay／支付連' },
      { href: '/admin/shipping', label: '物流', desc: '全站共用：綠界／藍新超商與宅配' },
      { href: '/admin/invoice', label: '發票', desc: '全站共用：ezPay／綠界／光貿電子發票' },
    ],
  },
  {
    key: 'shop',
    label: '電商',
    items: [
      { href: '/admin/products', label: '商品' },
      { href: '/admin/orders', label: '電商訂單' },
      { href: '/admin/coupons', label: '電商折扣碼' },
      { href: '/admin/reports', label: '電商報表' },
    ],
  },
  {
    key: 'learn',
    label: '課程',
    items: [
      { href: '/admin/courses', label: '課程管理' },
      { href: '/admin/course-orders', label: '課程訂單' },
      { href: '/admin/course-coupons', label: '課程折扣碼' },
      { href: '/admin/course-reports', label: '課程報表' },
    ],
  },
  { key: 'members', label: '會員資料庫', items: [{ href: '/admin/members', label: '會員資料庫', desc: '前台會員名單；電商客戶／課程學員自動標籤；可刪減' }] },
  { key: 'ai', label: 'AI 工作站', items: [{ href: '/admin/studio', label: 'AI 工作站', desc: '指令台／產圖／模板與任務管理（前台無工作站）' }] },
  {
    key: 'system',
    label: '系統功能',
    items: [
      { href: '/admin/system', label: '系統設定', desc: '總覽數字／AI API 路徑／維運稽核' },
      { href: '/admin/integrations', label: '儲存與通知' },
      { href: '/admin/accounts', label: '管理員' },
    ],
  },
];

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

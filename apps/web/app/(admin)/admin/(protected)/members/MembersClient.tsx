'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { MEMBER_TAG_LABELS, type MemberTag } from '@sitekit/shared';
import { fmtDateTime } from '@/lib/api-public';

export interface MemberRow {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  membershipTier: string | null;
  createdAt: string;
  tags: MemberTag[];
  shopOrders: number;
  courseOrders: number;
  courses: number;
  lastOrderAt: string | null;
}
const line = { borderColor: 'var(--line)' } as const;
const FILTERS: { key: string; label: string }[] = [
  { key: '', label: '全部' },
  { key: 'shop', label: '電商客戶' },
  { key: 'course', label: '課程學員' },
  { key: 'both', label: '兩者皆有' },
  { key: 'none', label: '尚無交易' },
];
const TAG_STYLE: Record<MemberTag, string> = { shop: 'bg-blue-100 text-blue-800', course: 'bg-green-100 text-green-800' };

export function MembersClient({ rows }: { rows: MemberRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return rows.filter((r) => (!k || r.email.toLowerCase().includes(k) || (r.displayName ?? '').toLowerCase().includes(k)) && (tag === '' || (tag === 'both' ? r.tags.length === 2 : tag === 'none' ? r.tags.length === 0 : r.tags.includes(tag as MemberTag))));
  }, [rows, q, tag]);
  const counts = useMemo(() => ({ all: rows.length, shop: rows.filter((r) => r.tags.includes('shop')).length, course: rows.filter((r) => r.tags.includes('course')).length, both: rows.filter((r) => r.tags.length === 2).length, none: rows.filter((r) => !r.tags.length).length }), [rows]);

  async function del(ids: string[]) {
    if (!ids.length) return;
    const targets = rows.filter((r) => ids.includes(r.id));
    if (!confirm(`確定刪除 ${ids.length} 位會員？\n${targets.slice(0, 5).map((r) => r.email).join('\n')}${targets.length > 5 ? '\n…' : ''}\n\n有訂單／點數紀錄者將匿名化停用並保留訂單；無交易者直接刪除。此動作無法復原。`)) return;
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/admin/members/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) });
    const j = (await r.json().catch(() => [])) as { id: string; email?: string; mode?: string; error?: string }[];
    setBusy(false);
    if (!r.ok) {
      setMsg(`刪除失敗：${JSON.stringify(j).slice(0, 200)}`);
      return;
    }
    const okN = j.filter((x) => !x.error).length;
    const anon = j.filter((x) => x.mode === 'anonymized').length;
    setMsg(`已處理 ${okN}／${ids.length}（匿名化 ${anon}、直接刪除 ${okN - anon}）${j.some((x) => x.error) ? '；失敗：' + j.filter((x) => x.error).map((x) => x.error).join('、') : ''}`);
    setSel(new Set());
    router.refresh();
  }
  const allSel = list.length > 0 && list.every((r) => sel.has(r.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input className="w-64 rounded border px-2 py-1" style={line} placeholder="搜尋 Email／名稱" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setTag(f.key)} className={`rounded border px-2 py-1 ${tag === f.key ? 'bg-black text-white' : ''}`} style={tag === f.key ? undefined : line}>
              {f.label}（{f.key === '' ? counts.all : counts[f.key as keyof typeof counts]}）
            </button>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-2">
          {sel.size ? (
            <button type="button" disabled={busy} onClick={() => del([...sel])} className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-50">
              刪除已勾選（{sel.size}）
            </button>
          ) : null}
          <button type="button" onClick={() => router.refresh()} className="rounded border px-2 py-1" style={line}>
            重新整理
          </button>
        </span>
      </div>
      {msg ? <p className="text-xs">{msg}</p> : null}
      <div className="overflow-x-auto rounded-lg border" style={line}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left" style={{ background: 'var(--card)' }}>
              <th className="p-2">
                <input type="checkbox" checked={allSel} onChange={(e) => setSel(e.target.checked ? new Set(list.map((r) => r.id)) : new Set())} title="全選本頁" />
              </th>
              <th className="p-2">Email</th>
              <th className="p-2">名稱</th>
              <th className="p-2">標籤</th>
              <th className="p-2">電商訂單</th>
              <th className="p-2">課程訂單／課程數</th>
              <th className="p-2">最近購買</th>
              <th className="p-2">註冊時間</th>
              <th className="p-2">狀態</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t" style={line}>
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={sel.has(r.id)}
                    onChange={(e) =>
                      setSel((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(r.id);
                        else n.delete(r.id);
                        return n;
                      })
                    }
                  />
                </td>
                <td className="p-2 font-mono">{r.email}</td>
                <td className="p-2">{r.displayName ?? '—'}</td>
                <td className="p-2">
                  <span className="flex flex-wrap gap-1">
                    {r.tags.length ? (
                      r.tags.map((t) => (
                        <span key={t} className={`rounded px-1.5 py-0.5 ${TAG_STYLE[t]}`}>
                          {MEMBER_TAG_LABELS[t]}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>尚無交易</span>
                    )}
                  </span>
                </td>
                <td className="p-2">{r.shopOrders}</td>
                <td className="p-2">
                  {r.courseOrders}／{r.courses}
                </td>
                <td className="p-2">{r.lastOrderAt ? fmtDateTime(r.lastOrderAt) : '—'}</td>
                <td className="p-2">{fmtDateTime(r.createdAt)}</td>
                <td className="p-2">{r.status === 'active' ? '正常' : r.status === 'suspended' ? '停權' : r.status}</td>
                <td className="p-2">
                  <button type="button" disabled={busy} onClick={() => del([r.id])} className="text-red-700 underline disabled:opacity-50">
                    刪除
                  </button>
                </td>
              </tr>
            ))}
            {!list.length ? (
              <tr>
                <td colSpan={10} className="p-4 text-center" style={{ color: 'var(--muted)' }}>
                  沒有符合的會員
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

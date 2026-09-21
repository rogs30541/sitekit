'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fmtDateTime } from '@/lib/api-public';

export interface AdminRow {
  id: string;
  email: string;
  displayName: string | null;
  role: 'admin' | 'superadmin';
  lastLoginAt: string | null;
  createdAt: string;
}
const input = 'rounded border px-2 py-1 text-sm';

export function AccountsClient({ rows, selfId, allowlist }: { rows: AdminRow[]; selfId: string; allowlist: string }) {
  const router = useRouter();
  const [wl, setWl] = useState(allowlist);
  const [form, setForm] = useState({ email: '', password: '', displayName: '', role: 'admin' });
  const [msg, setMsg] = useState('');

  async function call(path: string, method: string, body?: unknown) {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? '完成' : typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
    router.refresh();
    return r.ok;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <p className="mb-1 text-sm font-semibold">自助註冊白名單（Email 驗證）</p>
        <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
          後台登入頁的「註冊管理員」只寄驗證碼給這裡列出的 Email 或 @網域（逗號分隔）；註冊者角色為 admin。
        </p>
        <div className="flex flex-wrap gap-2">
          <input className={`${input} w-96`} style={{ borderColor: 'var(--line)' }} placeholder="ops@your.domain, @your.domain" value={wl} onChange={(e) => setWl(e.target.value)} />
          <button
            onClick={async () => {
              const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update_settings', params: { settings: { 'admin.registerAllowlist': wl } } }) });
              const j = await r.json().catch(() => ({}));
              setMsg(j.ok ? '白名單已更新' : `失敗：${j.error ?? r.status}`);
            }}
            className="rounded border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--line)' }}
          >
            儲存白名單
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <input className={`${input} w-56`} style={{ borderColor: 'var(--line)' }} type="email" placeholder="Email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className={`${input} w-44`} style={{ borderColor: 'var(--line)' }} type="password" placeholder="密碼（≥8）" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input className={`${input} w-36`} style={{ borderColor: 'var(--line)' }} placeholder="顯示名稱" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        <select className={input} style={{ borderColor: 'var(--line)' }} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="admin">admin</option>
          <option value="superadmin">superadmin</option>
        </select>
        <button
          onClick={async () => {
            if (await call('/api/admin/auth/users', 'POST', { ...form, displayName: form.displayName || undefined })) setForm({ email: '', password: '', displayName: '', role: 'admin' });
          }}
          disabled={!form.email || form.password.length < 8}
          className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          新增管理員
        </button>
        {msg ? <span className="text-xs">{msg}</span> : null}
      </div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr style={{ color: 'var(--muted)' }}>
            <th className="py-1">Email</th>
            <th className="py-1">名稱</th>
            <th className="py-1">角色</th>
            <th className="py-1">最近登入</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <td className="py-1">{a.email}</td>
              <td className="py-1">{a.displayName}</td>
              <td className="py-1">{a.role}</td>
              <td className="py-1">{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : '—'}</td>
              <td className="py-1">
                <span className="flex gap-2">
                  <button
                    className="underline"
                    onClick={() => {
                      const pw = window.prompt(`為 ${a.email} 設定新密碼（≥8）`);
                      if (pw && pw.length >= 8) call(`/api/admin/auth/users/${a.id}`, 'PATCH', { password: pw });
                    }}
                  >
                    重設密碼
                  </button>
                  {a.id !== selfId ? (
                    <button className="underline text-red-700" onClick={() => window.confirm(`刪除管理員 ${a.email}？`) && call(`/api/admin/auth/users/${a.id}`, 'DELETE')}>
                      刪除
                    </button>
                  ) : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

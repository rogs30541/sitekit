'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROLE_LABELS } from '@sitekit/shared';
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

export function AccountsClient({ rows, selfId, allowlist, primaryEmail }: { rows: AdminRow[]; selfId: string; allowlist: string; primaryEmail: string }) {
  const router = useRouter();
  const [wl, setWl] = useState(allowlist);
  const [form, setForm] = useState({ email: '', password: '', displayName: '', role: 'admin' });
  const [msg, setMsg] = useState('');
  const me = rows.find((r) => r.id === selfId);
  const [mine, setMine] = useState({ email: '', currentPassword: '' });
  const [mineMsg, setMineMsg] = useState('');

  async function call(path: string, method: string, body?: unknown) {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? '完成' : typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
    router.refresh();
    return r.ok;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }} data-my-account>
        <p className="mb-1 text-sm font-semibold">我的帳號</p>
        <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
          目前登入：<b>{me?.email}</b>
          {primaryEmail ? <>；主管理員 Email（第一位管理員輸入的、通知信與註冊驗證碼都以它為主）：<b>{primaryEmail}</b></> : null}
          。填錯 Email 收不到信就在這裡改：改完主管理員 Email 與站主通知信箱會跟著更新。
        </p>
        <div className="flex flex-wrap gap-2">
          <input className={`${input} w-64`} style={{ borderColor: 'var(--line)' }} type="email" placeholder="新的 Email" autoComplete="off" value={mine.email} onChange={(e) => setMine({ ...mine, email: e.target.value })} data-my-email />
          <input className={`${input} w-44`} style={{ borderColor: 'var(--line)' }} type="password" placeholder="目前密碼" autoComplete="current-password" value={mine.currentPassword} onChange={(e) => setMine({ ...mine, currentPassword: e.target.value })} data-my-password />
          <button
            disabled={!mine.email || !mine.currentPassword}
            onClick={async () => {
              const r = await fetch('/api/admin/auth/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(mine) });
              const j = await r.json().catch(() => ({}));
              setMineMsg(r.ok ? `已改為 ${j.admin?.email}；主管理員 Email：${j.primaryEmail}` : typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
              if (r.ok) setMine({ email: '', currentPassword: '' });
              router.refresh();
            }}
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
            style={{ borderColor: 'var(--line)' }}
            data-my-save
          >
            更換我的 Email
          </button>
          {mineMsg ? <span className="text-xs">{mineMsg}</span> : null}
        </div>
      </div>
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <p className="mb-1 text-sm font-semibold">自助註冊白名單（Email 驗證）</p>
        <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
          後台登入頁的「註冊管理員」只寄驗證碼給主管理員 Email 與這裡列出的 Email 或 @網域（逗號分隔）；註冊者角色為 admin。忘記密碼走登入頁「忘記密碼」；完全收不到信時用環境變數 SITEKIT_ADMIN_EMAIL／SITEKIT_ADMIN_PASSWORD 或 CLI「sitekit admin set-email」救援。
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
          <option value="admin">管理員</option>
          <option value="superadmin">超級管理員</option>
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
              <td className="py-1">
                {a.email}
                {a.email === primaryEmail ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-900">主管理員</span> : null}
              </td>
              <td className="py-1">{a.displayName}</td>
              <td className="py-1">{ROLE_LABELS[a.role] ?? a.role}</td>
              <td className="py-1">{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : '—'}</td>
              <td className="py-1">
                <span className="flex gap-2">
                  <button
                    className="underline"
                    onClick={() => {
                      const em = window.prompt(`把 ${a.email} 改成新的 Email`, a.email);
                      if (em && em !== a.email) call(`/api/admin/auth/users/${a.id}`, 'PATCH', { email: em.trim() });
                    }}
                  >
                    改 Email
                  </button>
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

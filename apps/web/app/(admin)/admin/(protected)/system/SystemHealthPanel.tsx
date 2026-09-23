'use client';

import { useEffect, useState } from 'react';

interface Check {
  ok: boolean;
  error?: string;
  hint?: string;
  [k: string]: unknown;
}
interface Health {
  at: string;
  version: string;
  appEnv: string;
  node: string;
  ok: boolean;
  db: Check & { ms: number };
  storage: Check & { driver: string; s3Ready: boolean; url?: string };
  email: Check & { provider: string; from?: string; adminTo?: string; lineConfigured?: boolean };
  site: Check & { url: string; status: number; version?: string };
  revalidate: Check & { status: number };
  payment: Check & { methods: string[] };
  secrets: { sessionSecret: 'env' | 'generated'; opsToken: 'env' | 'generated'; opsTokenConfigured: boolean };
}
const line = { borderColor: 'var(--line)' } as const;

/** 系統設定 → 健康檢查與支援：一頁看完 DB／儲存／Email／公開網址／發佈即清快取／付款方式；支援包下載；OPS token（superadmin） */
export function SystemHealthPanel({ isSuperadmin }: { isSuperadmin: boolean }) {
  const [h, setH] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [token, setToken] = useState<{ token: string | null; source: string } | null>(null);
  const [show, setShow] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/admin/system/health');
      setH(r.ok ? await r.json() : null);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const rows: { label: string; c: Check | undefined; detail: string }[] = h
    ? [
        { label: '資料庫', c: h.db, detail: `${h.db.ms} ms` },
        { label: '儲存（寫入後讀回）', c: h.storage, detail: `${h.storage.driver}${h.storage.driver === 'local' ? '（容器平台重部署會清掉，建議 R2）' : ''}` },
        { label: 'Email', c: h.email, detail: `${h.email.provider}${h.email.from ? ` · ${h.email.from}` : ''}${h.email.adminTo ? ` → ${h.email.adminTo}` : ''}` },
        { label: '公開網址可達（金流回呼／MCP）', c: h.site, detail: `${h.site.url}${h.site.status ? ` · HTTP ${h.site.status}` : ''}` },
        { label: '發佈即清快取（api → web）', c: h.revalidate, detail: h.revalidate.status ? `HTTP ${h.revalidate.status}` : '' },
        { label: '付款方式', c: h.payment, detail: h.payment.methods.join(', ') || '尚未啟用' },
      ]
    : [];

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => void load()} className="rounded border px-2 py-1 disabled:opacity-50" style={line}>
          {busy ? '檢查中…' : '重新檢查'}
        </button>
        <a href="/api/admin/system/support-bundle" className="rounded border px-2 py-1 underline" style={line}>
          下載支援包（機密已遮蔽）
        </a>
        {h ? (
          <span style={{ color: 'var(--muted)' }}>
            v{h.version} · {h.appEnv} · Node {h.node} · {new Date(h.at).toLocaleString('zh-TW', { hour12: false })}
          </span>
        ) : null}
        {msg ? <span>{msg}</span> : null}
      </div>
      {h ? (
        <table className="w-full text-left">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t" style={line}>
                <td className="w-6 py-1">{r.c?.ok ? '✅' : '⚠️'}</td>
                <td className="py-1 font-semibold">{r.label}</td>
                <td className="py-1">{r.detail}</td>
                <td className="py-1 text-amber-800">{r.c?.error ?? r.c?.hint ?? ''}</td>
              </tr>
            ))}
            <tr className="border-t" style={line}>
              <td className="py-1">{h.secrets.opsTokenConfigured ? '✅' : '⚠️'}</td>
              <td className="py-1 font-semibold">機密</td>
              <td className="py-1">
                SESSION_SECRET：{h.secrets.sessionSecret === 'env' ? '環境變數' : '自動產生（存於資料庫）'}；OPS_TOKEN：{h.secrets.opsToken === 'env' ? '環境變數' : '自動產生（存於資料庫）'}
              </td>
              <td className="py-1"></td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p style={{ color: 'var(--muted)' }}>{busy ? '檢查中…' : '無法讀取健康檢查'}</p>
      )}
      {isSuperadmin ? (
        <div className="rounded-lg border p-3" style={line}>
          <p className="mb-1 font-semibold">MCP 連接 token（OPS_TOKEN）</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const r = await fetch('/api/admin/system/ops-token');
                const jj = await r.json().catch(() => ({}));
                setToken(r.ok ? jj : null);
                setShow(true);
                if (!r.ok) setMsg(jj.message ?? '讀取失敗');
              }}
              className="rounded border px-2 py-1"
              style={line}
            >
              顯示 token
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!confirm('更換後所有 MCP 連接器都要改用新 token，確定？')) return;
                const r = await fetch('/api/admin/system/ops-token/rotate', { method: 'POST' });
                const jj = await r.json().catch(() => ({}));
                if (r.ok) {
                  setToken(jj);
                  setShow(true);
                  setMsg('已更換');
                } else setMsg(jj.message ?? '更換失敗');
              }}
              className="rounded border px-2 py-1"
              style={line}
            >
              更換 token
            </button>
          </div>
          {show && token ? (
            <>
              <code className="mt-2 block break-all rounded bg-neutral-100 p-2">{token.token ?? '（未設定）'}</code>
              <p className="mt-1" style={{ color: 'var(--muted)' }}>
                來源：{token.source === 'env' ? '環境變數（要更換請改平台環境變數）' : '自動產生，存於資料庫'}。Claude Desktop／Code 設定 SITEKIT_API_URL 為本站網址、SITEKIT_OPS_TOKEN 為此值。
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

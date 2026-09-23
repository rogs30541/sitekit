'use client';

import { useEffect, useState } from 'react';

interface BackupFile {
  name: string;
  size: number;
  at: string;
}
interface BackupState {
  daily: boolean;
  keep: number;
  lastAt: string | null;
  dir: string;
  files: BackupFile[];
}
const line = { borderColor: 'var(--line)' } as const;
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

/** 系統設定 → 備份與還原：立即備份／每日自動備份／備份清單（下載、刪除）／匯出下載／上傳還原（superadmin） */
export function SystemBackupPanel({ isSuperadmin }: { isSuperadmin: boolean }) {
  const [st, setSt] = useState<BackupState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [daily, setDaily] = useState(false);
  const [keep, setKeep] = useState(7);

  const load = async () => {
    const r = await fetch('/api/admin/system/backups');
    if (r.ok) {
      const j = (await r.json()) as BackupState;
      setSt(j);
      setDaily(j.daily);
      setKeep(j.keep);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const call = async (path: string, init?: RequestInit) => {
    setBusy(true);
    setMsg('');
    try {
      const r = await fetch(path, init);
      const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string; file?: string; size?: number; ok?: boolean; counts?: Record<string, number> };
      if (!r.ok) setMsg(`失敗：${j.message ?? j.error ?? r.status}`);
      else setMsg(j.file ? `已備份 ${j.file}（${kb(j.size ?? 0)}）` : j.counts ? `還原完成：${Object.values(j.counts).reduce((a, c) => a + c, 0)} 列` : '完成');
      await load();
    } finally {
      setBusy(false);
    }
  };
  const saveSchedule = async () => {
    setBusy(true);
    const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update_settings', params: { settings: { 'backup.daily': daily ? 'true' : 'false', 'backup.keep': String(keep) } } }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setMsg(j.ok ? '排程已儲存' : `儲存失敗：${j.error ?? ''}`);
    setBusy(false);
    await load();
  };
  const restore = async (file: File) => {
    if (!confirm(`還原會清空並覆蓋整個資料庫（所有會員、訂單、內容），以「${file.name}」的內容取代。這個動作無法復原，建議先按「立即備份」。確定？`)) return;
    const text = await file.text();
    let bundle: unknown;
    try {
      bundle = JSON.parse(text);
    } catch {
      setMsg('不是有效的 JSON');
      return;
    }
    await call('/api/admin/system/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bundle, confirm: true }) });
  };

  return (
    <div className="space-y-3 text-xs">
      <p style={{ color: 'var(--muted)' }}>
        備份＝整個資料庫的 JSON 快照（含機密），存在伺服器的備份目錄{st ? `（${st.dir}）` : ''}，只有超級管理員能下載。上傳的圖片不在 JSON 內：本機儲存請一併備份 storage 目錄，R2 在雲端本就持久。同一份匯出檔可在 SQLite 與 PostgreSQL 之間搬家。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || !isSuperadmin} onClick={() => void call('/api/admin/system/backups', { method: 'POST' })} className="rounded bg-black px-3 py-1.5 text-white disabled:opacity-50">
          立即備份
        </button>
        <a href="/api/admin/system/export?secrets=1" className={`rounded border px-3 py-1.5 underline ${isSuperadmin ? '' : 'pointer-events-none opacity-50'}`} style={line}>
          下載匯出（含機密，搬家用）
        </a>
        <a href="/api/admin/system/export" className={`rounded border px-3 py-1.5 underline ${isSuperadmin ? '' : 'pointer-events-none opacity-50'}`} style={line}>
          下載匯出（機密遮蔽）
        </a>
        <label className={`rounded border px-3 py-1.5 ${isSuperadmin && !busy ? 'cursor-pointer' : 'opacity-50'}`} style={line}>
          上傳還原…
          <input type="file" accept="application/json,.json" className="hidden" disabled={busy || !isSuperadmin} onChange={(e) => e.target.files?.[0] && void restore(e.target.files[0])} />
        </label>
        {msg ? <span>{msg}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2" style={line}>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} /> 每日自動備份
        </label>
        <label className="flex items-center gap-1">
          保留
          <input type="number" min={1} max={60} value={keep} onChange={(e) => setKeep(Number(e.target.value) || 7)} className="w-16 rounded border px-1 py-0.5" style={line} />份
        </label>
        <button type="button" disabled={busy} onClick={() => void saveSchedule()} className="rounded border px-2 py-1 disabled:opacity-50" style={line}>
          儲存排程
        </button>
        {st?.lastAt ? <span style={{ color: 'var(--muted)' }}>上次備份 {new Date(st.lastAt).toLocaleString('zh-TW', { hour12: false })}</span> : <span style={{ color: 'var(--muted)' }}>尚未備份過</span>}
      </div>
      {st?.files.length ? (
        <table className="w-full text-left">
          <thead>
            <tr style={{ color: 'var(--muted)' }}>
              <th className="py-1">檔案</th>
              <th className="py-1">大小</th>
              <th className="py-1">時間</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody>
            {st.files.map((f) => (
              <tr key={f.name} className="border-t" style={line}>
                <td className="py-1 font-mono">{f.name}</td>
                <td className="py-1">{kb(f.size)}</td>
                <td className="py-1">{new Date(f.at).toLocaleString('zh-TW', { hour12: false })}</td>
                <td className="py-1">
                  {isSuperadmin ? (
                    <>
                      <a href={`/api/admin/system/backups/${encodeURIComponent(f.name)}`} className="underline">
                        下載
                      </a>
                      <button type="button" disabled={busy} onClick={() => confirm(`刪除 ${f.name}？`) && void call(`/api/admin/system/backups/${encodeURIComponent(f.name)}`, { method: 'DELETE' })} className="ml-2 text-red-700 underline disabled:opacity-50">
                        刪除
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: 'var(--muted)' }}>{st ? '目前沒有備份檔。' : '載入中…'}</p>
      )}
    </div>
  );
}

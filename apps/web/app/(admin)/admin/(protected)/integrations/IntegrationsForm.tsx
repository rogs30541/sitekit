'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { STORAGE_DRIVER_LABELS } from '@sitekit/shared';
import { fmtDateTime } from '@/lib/api-public';

export interface IntegrationsStatus {
  storage: { driver: 'local' | 's3'; s3Ready: boolean; endpoint: string; bucket: string; publicUrl: string; localDir: string; localPersistent?: boolean | null };
  notify: { emailProvider: string; resendConfigured: boolean; from: string; adminTo: string; lineConfigured: boolean };
  recent: { at: string; kind: string; to: string; result: { channel: string; provider: string; ok: boolean; error?: string; skipped?: string } }[];
}
const input = 'w-full rounded border px-2 py-1 text-sm';
const FIELDS = {
  storage: [
    { key: 's3.endpoint', label: 'R2／S3 端點（https://<account>.r2.cloudflarestorage.com）' },
    { key: 's3.bucket', label: 'Bucket' },
    { key: 's3.region', label: 'Region（R2 填 auto）' },
    { key: 's3.accessKeyId', label: 'Access Key ID' },
    { key: 's3.secretAccessKey', label: 'Secret Access Key', secret: true },
    { key: 's3.publicUrl', label: '公開網址（自訂網域或 r2.dev）' },
  ],
  notify: [
    { key: 'resend.apiKey', label: 'Resend API Key', secret: true },
    { key: 'mail.from', label: '寄件人（需為 Resend 已驗證網域，例：AIGC創客 <no-reply@your.domain>）' },
    { key: 'mail.adminTo', label: '管理員收件信箱（新訂單通知）' },
    { key: 'line.channelToken', label: 'LINE Messaging API Channel access token', secret: true },
    { key: 'line.adminUserId', label: '管理員 LINE userId（U 開頭）' },
  ],
};

export function IntegrationsForm({ status }: { status: IntegrationsStatus }) {
  const router = useRouter();
  const [driver, setDriver] = useState<'local' | 's3'>(status.storage.driver);
  const [emailProvider, setEmailProvider] = useState(status.notify.emailProvider);
  const [values, setValues] = useState<Record<string, string>>({});
  const [testTo, setTestTo] = useState('');
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(action: string, params: Record<string, unknown>) {
    const r = await fetch('/api/admin/ai/act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, params }) });
    return r.json();
  }
  async function save() {
    setBusy(true);
    const settings: Record<string, string> = { 'storage.driver': driver, 'notify.emailProvider': emailProvider };
    for (const [k, v] of Object.entries(values)) if (v.trim()) settings[k] = v.trim();
    const j = await act('update_settings', { settings });
    setOut(j.ok ? `已儲存：${(j.data?.updated ?? []).join('、')}` : `失敗：${j.error ?? ''}`);
    setValues({});
    setBusy(false);
    router.refresh();
  }
  async function test() {
    setBusy(true);
    const j = await act('send_test_notification', testTo ? { to: testTo } : {});
    setOut(j.ok ? JSON.stringify(j.data) : `失敗：${j.error ?? ''}`);
    setBusy(false);
    router.refresh();
  }

  const badge = (ok: boolean, yes = '已設定', no = '未設定') => <span className={`rounded px-2 py-0.5 text-xs ${ok ? 'bg-green-100 text-green-800' : 'bg-neutral-100'}`}>{ok ? yes : no}</span>;
  const fields = (list: { key: string; label: string; secret?: boolean }[]) => (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {list.map((f) => (
        <label key={f.key} className="block text-xs">
          {f.label}
          <input className={input} style={{ borderColor: 'var(--line)', ...(f.secret ? { WebkitTextSecurity: 'disc' } : {}) }} name={f.key.replace(/\./g, '_')} autoComplete="off" data-lpignore="true" data-1p-ignore spellCheck={false} placeholder={f.secret ? '（留空不變）' : ''} value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold">物件儲存</span>
          <select value={driver} onChange={(e) => setDriver(e.target.value as 'local' | 's3')} className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }}>
            <option value="local">伺服器硬碟（{status.storage.localDir}）</option>
            <option value="s3">Cloudflare R2／S3 相容</option>
          </select>
          {badge(status.storage.s3Ready, 'R2 已設定', 'R2 未設定')}
          {status.storage.localPersistent === false ? <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">伺服器硬碟未掛持久硬碟</span> : status.storage.localPersistent === true ? badge(true, '持久硬碟') : null}
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            目前使用：{STORAGE_DRIVER_LABELS[status.storage.driver] ?? status.storage.driver}
            {status.storage.bucket ? ` · ${status.storage.bucket}` : ''}
          </span>
        </div>
        {fields(FIELDS.storage)}
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          AI 生成結果與搬運器落地的媒體會寫到這裡；部署在哪個平台就用該平台的硬碟（Zeabur 把硬碟掛到 /data 即可）；只有沒掛持久硬碟時重新部署才會清掉上傳檔，那種環境改用 R2。目前資料夾：{status.storage.localDir}
        </p>
      </div>
      <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold">通知中心</span>
          <select value={emailProvider} onChange={(e) => setEmailProvider(e.target.value)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--line)' }}>
            <option value="log">只記 log（不寄信）</option>
            <option value="resend">Resend</option>
          </select>
          {badge(status.notify.resendConfigured, 'Resend 已設定', 'Resend 未設定')}
          {badge(status.notify.lineConfigured, 'LINE 已設定', 'LINE 未設定')}
        </div>
        {fields(FIELDS.notify)}
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          事件：註冊歡迎信、付款成功（買家＋管理員 Email／LINE）、ATM 取號、出貨／送達、退款完成。皆為 best-effort，不影響訂單狀態。
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
          儲存設定
        </button>
        <input placeholder="測試收件信箱（可空＝管理員信箱）" value={testTo} onChange={(e) => setTestTo(e.target.value)} className="rounded border px-2 py-2 text-sm" style={{ borderColor: 'var(--line)', minWidth: '16rem' }} />
        <button onClick={test} disabled={busy} className="rounded border px-4 py-2 text-sm disabled:opacity-50" style={{ borderColor: 'var(--line)' }}>
          送測試通知
        </button>
        {out ? <span className="break-all text-xs">{out}</span> : null}
      </div>
      {status.recent.length ? (
        <div>
          <p className="mb-1 text-sm font-semibold">最近通知</p>
          <table className="w-full text-xs">
            <tbody>
              {status.recent.map((r, i) => (
                <tr key={i} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <td className="py-1">{fmtDateTime(r.at)}</td>
                  <td className="py-1">{r.kind}</td>
                  <td className="py-1">{r.to}</td>
                  <td className="py-1">
                    {r.result.channel === 'email' ? 'Email' : 'LINE'}（{r.result.provider === 'log' ? '只記 log' : r.result.provider}） {r.result.ok ? '成功' : r.result.skipped ? `略過：${r.result.skipped === 'line not configured' ? 'LINE 未設定' : r.result.skipped}` : `失敗：${r.result.error}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

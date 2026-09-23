'use client';

import { useEffect, useState } from 'react';

type Status = { needsSetup: boolean; completed: boolean; version: string };
const STEPS = ['管理員', '站名與網址', '儲存', 'Email', '金流', '完成'] as const;
const input = 'w-full rounded border px-2 py-1.5 text-sm';
const line = { borderColor: 'var(--line)' } as const;

async function j<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const r = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  const t = await r.text();
  let body: unknown;
  try {
    body = JSON.parse(t);
  } catch {
    body = { message: t };
  }
  return { status: r.status, body: body as T };
}
const act = (action: string, params: Record<string, unknown>) => j<{ ok: boolean; error?: string; data?: Record<string, unknown> }>('/api/admin/ai/act', { method: 'POST', body: JSON.stringify({ action, params }) });
const errText = (b: unknown) => {
  const m = (b as { message?: unknown; error?: unknown })?.message ?? (b as { error?: unknown })?.error;
  return typeof m === 'string' ? m : JSON.stringify(m ?? b);
};

/**
 * 安裝精靈（對齊 WordPress「5 分鐘安裝」）：
 * 1 建立第一位超級管理員（admin_users 為空時免 Email 驗證；建立即登入）
 * 2 站名與網址 → 3 儲存（本機或 R2）→ 4 Email（Resend）→ 5 金流（可跳過）→ 6 完成（顯示 OPS token）
 */
export function SetupWizard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [admin, setAdmin] = useState<{ email: string; role: string } | null>(null);
  const [step, setStep] = useState(0);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('');

  const [a, setA] = useState({ email: '', password: '', displayName: '' });
  const [site, setSite] = useState({ siteName: '', name: '', url: '' });
  const [st, setSt] = useState({ driver: 'local', endpoint: '', bucket: '', accessKeyId: '', secretAccessKey: '', publicUrl: '' });
  const [mail, setMail] = useState({ provider: 'log', apiKey: '', from: '', adminTo: '' });
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    void (async () => {
      const s = (await j<Status>('/api/setup/status')).body;
      setStatus(s);
      const me = (await j<{ authenticated?: boolean; admin?: { email: string; role: string } }>('/api/admin/auth/me')).body;
      if (me?.authenticated && me.admin) {
        setAdmin(me.admin);
        setMail((m) => ({ ...m, adminTo: me.admin!.email }));
        if (!s.needsSetup) setStep(1);
      }
      const settings = (await act('get_settings', {})).body?.data as Record<string, string> | undefined;
      if (settings) {
        setSite({ siteName: settings['brand.siteName'] ?? '', name: settings['brand.name'] ?? '', url: settings['site.url'] ?? window.location.origin });
        setSt((v) => ({ ...v, driver: settings['storage.driver'] ?? 'local', endpoint: settings['s3.endpoint'] ?? '', bucket: settings['s3.bucket'] ?? '', publicUrl: settings['s3.publicUrl'] ?? '' }));
        setMail((v) => ({ ...v, provider: settings['notify.emailProvider'] ?? 'log', from: settings['mail.from'] ?? '', adminTo: settings['mail.adminTo'] || v.adminTo }));
      } else {
        setSite((v) => ({ ...v, url: window.location.origin }));
      }
    })();
  }, []);

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setMsg('');
    try {
      const m = await fn();
      if (m) setMsg(m);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const save = async (settings: Record<string, string>) => {
    const r = await act('update_settings', { settings });
    if (!r.body.ok) throw new Error(r.body.error ?? '儲存失敗');
  };

  const createAdmin = () =>
    run(async () => {
      const r = await j<{ ok?: boolean; admin?: { email: string; role: string } }>('/api/setup/admin', { method: 'POST', body: JSON.stringify(a) });
      if (r.status >= 400) throw new Error(errText(r.body));
      setAdmin(r.body.admin ?? { email: a.email, role: 'superadmin' });
      setMail((m) => ({ ...m, adminTo: a.email }));
      setStatus((s) => (s ? { ...s, needsSetup: false } : s));
      setSite((v) => ({ ...v, url: v.url || window.location.origin }));
      setStep(1);
    });
  const saveSite = () =>
    run(async () => {
      if (!site.siteName.trim()) throw new Error('請填網站名稱');
      await save({ 'brand.siteName': site.siteName.trim(), 'brand.name': (site.name || site.siteName).trim(), 'site.url': (site.url || origin).replace(/\/$/, '') });
      setStep(2);
    });
  const saveStorage = () =>
    run(async () => {
      if (st.driver === 's3') {
        if (!st.endpoint || !st.bucket || !st.accessKeyId || !st.secretAccessKey) throw new Error('R2／S3 需要 endpoint、bucket、Access Key、Secret Key');
        await save({ 'storage.driver': 's3', 's3.endpoint': st.endpoint, 's3.bucket': st.bucket, 's3.accessKeyId': st.accessKeyId, 's3.secretAccessKey': st.secretAccessKey, 's3.publicUrl': st.publicUrl, 's3.region': 'auto' });
      } else await save({ 'storage.driver': 'local' });
      const h = (await j<{ storage?: { ok: boolean; driver: string; error?: string } }>('/api/admin/system/health')).body;
      if (h.storage && !h.storage.ok) throw new Error(`儲存測試失敗（${h.storage.driver}）：${h.storage.error ?? ''}`);
      setStep(3);
      return `儲存測試通過（${h.storage?.driver}）`;
    });
  const saveMail = () =>
    run(async () => {
      if (mail.provider === 'resend') {
        if (!mail.apiKey || !mail.from) throw new Error('Resend 需要 API Key 與寄件人');
        await save({ 'notify.emailProvider': 'resend', 'resend.apiKey': mail.apiKey, 'mail.from': mail.from, 'mail.adminTo': mail.adminTo });
        const t = await act('send_test_notification', { to: mail.adminTo });
        const ok = (t.body.data as { mail?: { ok?: boolean; error?: string } } | undefined)?.mail?.ok;
        if (!ok) throw new Error(`測試信寄送失敗：${(t.body.data as { mail?: { error?: string } } | undefined)?.mail?.error ?? t.body.error ?? ''}`);
        setStep(4);
        return `測試信已寄到 ${mail.adminTo}`;
      }
      await save({ 'notify.emailProvider': 'log', 'mail.adminTo': mail.adminTo });
      setStep(4);
      return '先用 log 模式（不寄信）；之後可到「儲存與通知」補 Resend';
    });
  const finish = () =>
    run(async () => {
      const r = await j('/api/setup/complete', { method: 'POST' });
      if (r.status >= 400) throw new Error(errText(r.body));
      const t = await j<{ token?: string | null }>('/api/admin/system/ops-token');
      setToken(t.status === 200 ? (t.body.token ?? null) : null);
      setStep(5);
    });

  if (!status) return <p className="text-sm">載入中…</p>;
  const needLogin = !status.needsSetup && !admin;

  return (
    <div className="rounded-xl border p-6" style={{ ...line, background: 'var(--card)' }}>
      <h1 className="text-xl font-bold">SiteKit 安裝精靈</h1>
      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
        版本 {status.version}。像 WordPress 一樣，五步驟把站台建好；每一步之後都可以在後台再改。
      </p>
      <ol className="my-4 flex flex-wrap gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-full border px-2 py-0.5 ${i === step ? 'bg-black text-white' : i < step ? 'opacity-60 line-through' : 'opacity-60'}`} style={i === step ? undefined : line}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      {msg ? <p className="mb-3 rounded bg-amber-50 p-2 text-xs text-amber-900">{msg}</p> : null}

      {needLogin ? (
        <p className="text-sm">
          站台已有管理員。請先
          <a href="/admin/login?next=/setup" className="mx-1 underline">
            登入後台
          </a>
          再繼續精靈，或直接進入後台。
        </p>
      ) : null}

      {step === 0 && status.needsSetup ? (
        <form
          className="space-y-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void createAdmin();
          }}
        >
          <p style={{ color: 'var(--muted)' }}>這個站台還沒有管理員。第一位建立者即為超級管理員（之後的管理員要由你在後台新增或白名單註冊）。</p>
          <input className={input} style={line} type="email" placeholder="管理員 Email" required autoComplete="off" value={a.email} onChange={(e) => setA({ ...a, email: e.target.value })} />
          <input className={input} style={line} type="password" placeholder="密碼（至少 8 碼）" required minLength={8} autoComplete="new-password" value={a.password} onChange={(e) => setA({ ...a, password: e.target.value })} />
          <input className={input} style={line} placeholder="顯示名稱（選填）" value={a.displayName} onChange={(e) => setA({ ...a, displayName: e.target.value })} />
          <button disabled={busy} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
            建立並登入
          </button>
        </form>
      ) : null}

      {step === 1 && admin ? (
        <div className="space-y-2 text-sm">
          <label className="block">
            網站名稱（標題列、頁尾）
            <input className={input} style={line} value={site.siteName} onChange={(e) => setSite({ ...site, siteName: e.target.value })} placeholder="例：小明烘焙坊" />
          </label>
          <label className="block">
            品牌名稱（選填，預設同網站名稱）
            <input className={input} style={line} value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} />
          </label>
          <label className="block">
            公開網址（金流回呼、Email 連結、MCP 都用它）
            <input className={input} style={line} value={site.url} onChange={(e) => setSite({ ...site, url: e.target.value })} placeholder={origin} />
          </label>
          <button disabled={busy} onClick={() => void saveSite()} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
            下一步
          </button>
        </div>
      ) : null}

      {step === 2 && admin ? (
        <div className="space-y-2 text-sm">
          <p style={{ color: 'var(--muted)' }}>上傳的圖片、商品封面與 AI 產圖存在哪裡。容器平台（Zeabur 等）重新部署會清掉本機磁碟，建議用 Cloudflare R2；VPS 或有持久磁碟的主機可用本機。</p>
          <label className="flex items-center gap-2">
            <input type="radio" checked={st.driver === 'local'} onChange={() => setSt({ ...st, driver: 'local' })} /> 本機磁碟（預設）
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={st.driver === 's3'} onChange={() => setSt({ ...st, driver: 's3' })} /> Cloudflare R2／S3 相容
          </label>
          {st.driver === 's3' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={input} style={line} placeholder="Endpoint https://<accountid>.r2.cloudflarestorage.com" value={st.endpoint} onChange={(e) => setSt({ ...st, endpoint: e.target.value })} />
              <input className={input} style={line} placeholder="Bucket" value={st.bucket} onChange={(e) => setSt({ ...st, bucket: e.target.value })} />
              <input className={input} style={line} placeholder="Access Key ID" autoComplete="off" value={st.accessKeyId} onChange={(e) => setSt({ ...st, accessKeyId: e.target.value })} />
              <input className={input} style={line} type="password" placeholder="Secret Access Key" autoComplete="off" value={st.secretAccessKey} onChange={(e) => setSt({ ...st, secretAccessKey: e.target.value })} />
              <input className={`${input} sm:col-span-2`} style={line} placeholder="公開網址（自訂網域或 https://pub-xxx.r2.dev）" value={st.publicUrl} onChange={(e) => setSt({ ...st, publicUrl: e.target.value })} />
            </div>
          ) : null}
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => void saveStorage()} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
              儲存並測試
            </button>
            <button disabled={busy} onClick={() => setStep(1)} className="rounded border px-3 py-2" style={line}>
              上一步
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 && admin ? (
        <div className="space-y-2 text-sm">
          <p style={{ color: 'var(--muted)' }}>管理員註冊驗證碼、忘記密碼、訂單通知都靠 Email。沒有寄信服務時先選 log（只寫日誌），之後再補。</p>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mail.provider === 'log'} onChange={() => setMail({ ...mail, provider: 'log' })} /> 先不寄信（log）
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mail.provider === 'resend'} onChange={() => setMail({ ...mail, provider: 'resend' })} /> Resend（免費額度每天 100 封）
          </label>
          {mail.provider === 'resend' ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={input} style={line} type="password" placeholder="Resend API Key" autoComplete="off" value={mail.apiKey} onChange={(e) => setMail({ ...mail, apiKey: e.target.value })} />
              <input className={input} style={line} placeholder="寄件人，例：小明烘焙坊 <no-reply@你的網域>" value={mail.from} onChange={(e) => setMail({ ...mail, from: e.target.value })} />
            </div>
          ) : null}
          <label className="block">
            管理員通知信箱（新訂單、提問通知）
            <input className={input} style={line} type="email" value={mail.adminTo} onChange={(e) => setMail({ ...mail, adminTo: e.target.value })} />
          </label>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => void saveMail()} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
              {mail.provider === 'resend' ? '儲存並寄測試信' : '下一步'}
            </button>
            <button disabled={busy} onClick={() => setStep(2)} className="rounded border px-3 py-2" style={line}>
              上一步
            </button>
          </div>
        </div>
      ) : null}

      {step === 4 && admin ? (
        <div className="space-y-2 text-sm">
          <p style={{ color: 'var(--muted)' }}>金流、物流、電子發票各家商店參數在後台「帳務」填；現在可以先跳過，站台照樣能瀏覽與管理內容（結帳會提示尚未啟用付款方式）。</p>
          <div className="flex flex-wrap gap-2">
            <a href="/admin/payments" target="_blank" className="rounded border px-3 py-2 underline" style={line}>
              另開「帳務 → 金流」設定
            </a>
            <button disabled={busy} onClick={() => void finish()} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
              完成安裝
            </button>
            <button disabled={busy} onClick={() => setStep(3)} className="rounded border px-3 py-2" style={line}>
              上一步
            </button>
          </div>
        </div>
      ) : null}

      {step === 5 && admin ? (
        <div className="space-y-3 text-sm">
          <p className="rounded bg-green-50 p-2 text-green-800">安裝完成。前台與後台都可以使用了。</p>
          {token ? (
            <div className="rounded border p-3 text-xs" style={line}>
              <p className="font-semibold">MCP 連接 token（OPS_TOKEN）——只給你信任的 AI 工具，之後可在「系統設定 → 健康檢查與支援」查看或更換</p>
              <code className="mt-1 block break-all rounded bg-neutral-100 p-2">{token}</code>
              <p className="mt-2" style={{ color: 'var(--muted)' }}>
                Claude Desktop／Claude Code 設定：<code>SITEKIT_API_URL={site.url || origin}</code>、<code>SITEKIT_OPS_TOKEN=上面的 token</code>
              </p>
            </div>
          ) : null}
          <div className="flex gap-2">
            <a href="/admin" className="rounded bg-black px-4 py-2 text-white">
              進入後台
            </a>
            <a href="/" className="rounded border px-3 py-2" style={line}>
              看前台
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

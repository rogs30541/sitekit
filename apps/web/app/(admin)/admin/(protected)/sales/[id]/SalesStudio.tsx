'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BLOCK_MAP, SALES_ITEM_KINDS, SALES_SECTIONS, SALES_STATUS_LABELS, emptyDesign, insertNode, type DesignDoc, type SalesItemKind, type SalesPageDoc, type SalesSectionKey } from '@sitekit/shared';
import { DesignEditor } from '../../content/[id]/DesignEditor';
import { TrackingFields } from '@/components/TrackingFields';

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  price: number;
  coverUrl: string | null;
  isActive: boolean;
  category?: string | null;
  type: string;
}
export interface SalesPayload {
  page: { id: string; slug: string; title: string; code: string; status: string; version: number; publishedAt: string | null; updatedAt: string; url: string; state: string };
  doc: SalesPageDoc;
  products: ProductRow[];
  dirty: boolean;
  lint: { level: 'error' | 'warn'; message: string }[];
  preview: { url: string; token: string; expiresAt: string };
}
type Tab = 'setup' | 'content' | 'products' | 'form' | 'order' | 'tracking' | 'seo';
const TABS: { key: Tab; label: string }[] = [
  { key: 'setup', label: '設定' },
  { key: 'content', label: '內文' },
  { key: 'products', label: '銷售（產品）' },
  { key: 'form', label: '表單' },
  { key: 'order', label: '順序' },
  { key: 'tracking', label: '追蹤' },
  { key: 'seo', label: 'SEO／風格' },
];
const input = 'w-full rounded border px-2 py-1 text-sm';
const line = { borderColor: 'var(--line)' } as const;

async function uploadImage(file: File): Promise<string> {
  const dataBase64 = await new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
  const r = await fetch('/api/admin/content/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, dataBase64 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof j.message === 'string' ? j.message : '上傳失敗');
  return j.url as string;
}

/**
 * 銷售頁工作台（對標 1shop 銷售頁：設定／內文／銷售／表單／順序／追蹤／SEO）。
 * 所有修改自動存草稿；沙盒預覽；發佈需確認（檢測＋備份說明）；版本可還原到草稿。
 */
export function SalesStudio({ initial, allProducts }: { initial: SalesPayload; allProducts: ProductRow[] }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [doc, setDoc] = useState<SalesPageDoc>(initial.doc);
  const [meta, setMeta] = useState({ title: initial.page.title, slug: initial.page.slug, code: initial.page.code });
  const [tab, setTab] = useState<Tab>('setup');
  const [saving, setSaving] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [revOpen, setRevOpen] = useState(false);
  const [revisions, setRevisions] = useState<{ version: number; title: string; slug: string; note: string | null; createdBy: string | null; createdAt: string }[] | null>(null);
  const [password, setPassword] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skip = useRef(true);

  const patch = (p: Partial<SalesPageDoc> | ((d: SalesPageDoc) => SalesPageDoc)) => setDoc((d) => (typeof p === 'function' ? p(d) : { ...d, ...p }));
  const set = <K extends keyof SalesPageDoc>(k: K, v: Partial<SalesPageDoc[K]>) => setDoc((d) => ({ ...d, [k]: { ...(d[k] as object), ...(v as object) } as SalesPageDoc[K] }));

  const save = useCallback(
    async (quiet = false) => {
      setSaving('saving');
      const body: Record<string, unknown> = { title: meta.title, slug: meta.slug, code: meta.code, doc: { ...doc, access: { ...doc.access, ...(password ? { password } : { password: undefined }) } } };
      const r = await fetch(`/api/admin/sales/${data.page.id}/draft`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSaving('error');
        setMsg(`草稿儲存失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
        return null;
      }
      const payload = j as SalesPayload;
      setData(payload);
      setMeta((m) => ({ ...m, slug: payload.page.slug }));
      if (password) setPassword('');
      setSaving('saved');
      if (!quiet) setMsg('草稿已儲存（線上頁面未變更）');
      return payload;
    },
    [data.page.id, doc, meta, password],
  );
  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    setSaving('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(true), 1500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, meta]);

  async function openPreview() {
    const d = await save(true);
    const r = await fetch(`/api/admin/sales/${data.page.id}/preview-token`, { method: 'POST' });
    const j = await r.json().catch(() => null);
    const url = j?.url ?? d?.preview.url ?? data.preview.url;
    window.open(url, '_blank', 'noopener');
    setMsg(`沙盒預覽連結（2 小時有效）：${url}`);
  }
  async function loadRevisions() {
    const r = await fetch(`/api/admin/sales/${data.page.id}/revisions`);
    const j = await r.json().catch(() => null);
    setRevisions(j?.revisions ?? []);
    setRevOpen(true);
  }
  async function restore(v: number) {
    if (!window.confirm(`把第 ${v} 版還原到「草稿」？線上不會改變，還原後請預覽並再次確認發佈。`)) return;
    const r = await fetch(`/api/admin/sales/${data.page.id}/revisions/${v}/restore`, { method: 'POST' });
    const j = (await r.json().catch(() => null)) as SalesPayload | null;
    if (!r.ok || !j) return setMsg('還原失敗');
    skip.current = true;
    setData(j);
    setDoc(j.doc);
    setMeta({ title: j.page.title, slug: j.page.slug, code: j.page.code });
    setRevOpen(false);
    setMsg(`已把第 ${v} 版還原到草稿`);
  }
  async function unpublish() {
    if (!window.confirm('把銷售頁下架？前台將無法存取。')) return;
    const r = await fetch(`/api/admin/sales/${data.page.id}/unpublish`, { method: 'POST' });
    if (r.ok) {
      setData((d) => ({ ...d, page: { ...d.page, status: 'draft', state: 'draft' } }));
      setMsg('已下架');
      router.refresh();
    }
  }
  async function remove() {
    if (!window.confirm('確定刪除這個銷售頁（含草稿與版本）？不可復原。')) return;
    await fetch(`/api/admin/sales/${data.page.id}`, { method: 'DELETE' });
    router.push('/admin/sales');
    router.refresh();
  }

  const p = data.page;
  const dirty = saving === 'dirty' || saving === 'saving' || data.dirty;
  const items = [...doc.items].sort((a, b) => a.order - b.order);
  const productOf = (id: string) => allProducts.find((x) => x.id === id) ?? data.products.find((x) => x.id === id);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs" style={{ ...line, background: 'var(--card)' }}>
        <input className={`${input} max-w-64 font-semibold`} style={line} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} placeholder="銷售頁標題" />
        <span className="flex items-center gap-1 font-mono">
          /s/
          <input className={`${input} w-36 font-mono`} style={line} value={meta.slug} onChange={(e) => setMeta({ ...meta, slug: e.target.value })} />
        </span>
        <span className={`rounded px-2 py-0.5 ${p.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-neutral-100'}`}>{p.status === 'published' ? `線上 v${p.version}（${SALES_STATUS_LABELS[p.state] ?? p.state}）` : '未上線'}</span>
        <span className={`rounded px-2 py-0.5 ${saving === 'error' ? 'bg-red-100 text-red-800' : dirty ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100'}`}>{saving === 'saving' ? '儲存草稿中…' : saving === 'error' ? '草稿儲存失敗' : dirty ? '草稿有未發佈變更' : '草稿＝線上'}</span>
        <span className="ml-auto flex flex-wrap gap-1">
          <button onClick={() => void save()} className="rounded border px-2 py-1" style={line}>
            儲存草稿
          </button>
          <button onClick={openPreview} className="rounded border px-2 py-1" style={line}>
            沙盒預覽
          </button>
          <button onClick={loadRevisions} className="rounded border px-2 py-1" style={line}>
            版本
          </button>
          <button onClick={() => setPublishOpen(true)} className="rounded bg-black px-3 py-1 font-semibold text-white">
            發佈…
          </button>
          {p.status === 'published' ? (
            <button onClick={unpublish} className="rounded border px-2 py-1" style={line}>
              下架
            </button>
          ) : null}
          <button onClick={remove} className="rounded border px-2 py-1 text-red-700" style={line}>
            刪除
          </button>
        </span>
      </div>
      {msg ? (
        <p className="break-all text-xs" style={{ color: 'var(--muted)' }}>
          {msg}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1 border-b text-xs" style={line}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 ${tab === t.key ? 'border-b-2 border-black font-bold' : 'opacity-70'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'setup' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="基本設定" desc="「銷售頁編號前綴」會顯示在訂單最前方，方便從訂單識別所屬銷售頁。">
            <Field label="銷售頁編號前綴（英文大寫或數字 1–3 位）">
              <input className={input} style={line} value={meta.code} onChange={(e) => setMeta({ ...meta, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) })} />
            </Field>
            <Field label="狀態">
              <span className="text-xs">{p.status === 'published' ? '公開（線上）' : '未上線（用上方「發佈…」上線）'}</span>
            </Field>
          </Card>
          <Card title="預約開啟／頁面關閉" desc="系統依時間自動開啟或關閉；關閉時顯示訊息。">
            <div className="grid grid-cols-2 gap-2">
              <Field label="開啟時間">
                <input type="datetime-local" className={input} style={line} value={doc.schedule.openAt.slice(0, 16)} onChange={(e) => set('schedule', { openAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
              </Field>
              <Field label="關閉時間">
                <input type="datetime-local" className={input} style={line} value={doc.schedule.closeAt.slice(0, 16)} onChange={(e) => set('schedule', { closeAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
              </Field>
            </div>
            <Field label="頁面關閉訊息">
              <textarea className={input} style={line} rows={2} value={doc.schedule.closedMessage} onChange={(e) => set('schedule', { closedMessage: e.target.value })} />
            </Field>
            <Toggle label="關閉後仍可對已成立訂單付款" checked={doc.schedule.closedOrdersPayable} onChange={(v) => set('schedule', { closedOrdersPayable: v })} />
          </Card>
          <Card title="銷售頁通知" desc="固定顯示在最上方，具有關閉按鈕的訊息通知。">
            <Toggle label="啟用銷售頁通知" checked={doc.notice.enabled} onChange={(v) => set('notice', { enabled: v })} />
            <textarea className={input} style={line} rows={2} value={doc.notice.text} onChange={(e) => set('notice', { text: e.target.value })} placeholder="例：滿千免運，活動到 9/30" />
          </Card>
          <Card title="優惠倒數" desc="固定顯示在最上方、無法關閉、不斷倒數提醒顧客。同時啟用時通知會在最上方。">
            <Toggle label="啟用優惠倒數" checked={doc.countdown.enabled} onChange={(v) => set('countdown', { enabled: v })} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="結束時間">
                <input type="datetime-local" className={input} style={line} value={doc.countdown.endsAt.slice(0, 16)} onChange={(e) => set('countdown', { endsAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
              </Field>
              <Field label="文字">
                <input className={input} style={line} value={doc.countdown.text} onChange={(e) => set('countdown', { text: e.target.value })} />
              </Field>
            </div>
          </Card>
          <Card title="密碼保護" desc="啟用後必須輸入密碼才能查看頁面。">
            <Toggle label="啟用密碼" checked={doc.access.passwordEnabled} onChange={(v) => set('access', { passwordEnabled: v })} />
            <input className={input} style={line} type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={doc.access.password ? '（已設定，留空不變）' : '設定密碼'} />
          </Card>
          <Card title="客服設定" desc="銷售頁右下角顯示客服按鈕。">
            {(['line', 'facebook', 'telegram', 'email', 'phone'] as const).map((k) => (
              <Field key={k} label={{ line: 'LINE（@id 或連結）', facebook: 'Facebook 粉絲專頁連結', telegram: 'Telegram', email: '客服 Email', phone: '客服電話' }[k]}>
                <input className={input} style={line} value={doc.contact[k]} onChange={(e) => set('contact', { [k]: e.target.value } as Partial<SalesPageDoc['contact']>)} />
              </Field>
            ))}
            <Field label="顯示方式">
              <select className={input} style={line} value={doc.contact.display} onChange={(e) => set('contact', { display: e.target.value as 'collapsed' | 'expanded' })}>
                <option value="collapsed">收合（一個按鈕，點擊展開）</option>
                <option value="expanded">展開（每一個都顯示）</option>
              </select>
            </Field>
          </Card>
          <Card title="訂單成立說明／推薦" desc="顯示在訂單成立頁最上方；並可推薦另一個銷售頁。">
            <Toggle label="啟用訂單成立說明" checked={doc.success.note.enabled} onChange={(v) => set('success', { note: { ...doc.success.note, enabled: v } })} />
            <textarea className={input} style={line} rows={3} value={doc.success.note.text} onChange={(e) => set('success', { note: { ...doc.success.note, text: e.target.value } })} />
            <Field label="訂單成立後推薦的銷售頁 slug">
              <input className={input} style={line} value={doc.success.recommendSlug} onChange={(e) => set('success', { recommendSlug: e.target.value })} />
            </Field>
          </Card>
          <Card title="銷售頁設定" desc="產品圖片、按鈕樣式、數量方式、每行產品數。">
            <div className="grid grid-cols-2 gap-2">
              <Field label="產品圖片">
                <select className={input} style={line} value={doc.display.imageRatio} onChange={(e) => set('display', { imageRatio: e.target.value as SalesPageDoc['display']['imageRatio'] })}>
                  <option value="square-crop">正方形／超過裁切</option>
                  <option value="square-fit">正方形／不裁切</option>
                  <option value="original">原始比例</option>
                </select>
              </Field>
              <Field label="按鈕樣式">
                <select className={input} style={line} value={doc.display.buttonStyle} onChange={(e) => set('display', { buttonStyle: e.target.value as SalesPageDoc['display']['buttonStyle'] })}>
                  <option value="pill">半圓形</option>
                  <option value="soft">直角＋柔化</option>
                  <option value="square">90° 直角</option>
                </select>
              </Field>
              <Field label="調整數量方式">
                <select className={input} style={line} value={doc.display.quantityMode} onChange={(e) => set('display', { quantityMode: e.target.value as SalesPageDoc['display']['quantityMode'] })}>
                  <option value="buttons">加減按鈕</option>
                  <option value="select">下拉選單</option>
                </select>
              </Field>
              <Field label="電腦版每行產品數">
                <select className={input} style={line} value={doc.display.columnsDesktop} onChange={(e) => set('display', { columnsDesktop: Number(e.target.value) as SalesPageDoc['display']['columnsDesktop'] })}>
                  <option value={0}>列表式（建議）</option>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      每行 {n} 個
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="手機版每行產品數">
                <select className={input} style={line} value={doc.display.columnsMobile} onChange={(e) => set('display', { columnsMobile: Number(e.target.value) as 1 | 2 })}>
                  <option value={1}>每行 1 個（建議）</option>
                  <option value={2}>每行 2 個</option>
                </select>
              </Field>
              <Field label="剩餘數量顯示">
                <select className={input} style={line} value={doc.display.showStock} onChange={(e) => set('display', { showStock: e.target.value as SalesPageDoc['display']['showStock'] })}>
                  <option value="never">不顯示</option>
                  <option value="always">顯示所有數量</option>
                  <option value="low">數量低於 10 時顯示</option>
                </select>
              </Field>
              <Field label="銷售數量顯示">
                <select className={input} style={line} value={doc.display.showSold} onChange={(e) => set('display', { showSold: e.target.value as SalesPageDoc['display']['showSold'] })}>
                  <option value="never">不顯示</option>
                  <option value="always">顯示</option>
                </select>
              </Field>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(['offer', 'product', 'addon'] as const).map((k) => (
                <Field key={k} label={`${{ offer: '優惠', product: '一般產品', addon: '加購品' }[k]}數量上限`}>
                  <input type="number" className={input} style={line} value={doc.cartLimits[k] ?? ''} onChange={(e) => set('cartLimits', { [k]: e.target.value ? Number(e.target.value) : null } as Partial<SalesPageDoc['cartLimits']>)} placeholder="不限" />
                </Field>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'content' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs" style={line}>
            <span className="font-semibold">新增區塊：</span>
            {[
              ['image', '圖片'],
              ['embed', '影片（YouTube）'],
              ['richtext', '文字編輯器'],
              ['html', '程式（HTML）'],
              ['addtocart', '加入購物車'],
            ].map(([type, label]) => (
              <button
                key={type}
                onClick={() => {
                  const d = doc.content ?? emptyDesign();
                  const node = BLOCK_MAP[type].make();
                  patch({ content: { ...d, root: insertNode(d.root, 'root', d.root.children?.length ?? 0, node) } });
                }}
                className="rounded border px-2 py-1"
                style={line}
              >
                ＋ {label}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-3">
              <Toggle label="內文加入購物車按鈕" checked={doc.contentOptions.addToCartButton} onChange={(v) => set('contentOptions', { addToCartButton: v })} />
              <Toggle label="瀏覽漏斗追蹤" checked={doc.contentOptions.funnelTracking} onChange={(v) => set('contentOptions', { funnelTracking: v })} />
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            圖片建議寬度 1000px、2MB 內；影片放最上面最吸睛；也可從左側物件庫拖入任何區塊或套用區塊模板。
          </p>
          <DesignEditor doc={doc.content ?? emptyDesign()} onChange={(d: DesignDoc) => patch({ content: d })} onUpload={uploadImage} />
        </div>
      ) : null}

      {tab === 'products' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="挑選產品" desc="勾選要放進這個銷售頁的商品，並指定放在哪個區塊。">
            <div className="max-h-[60vh] space-y-1 overflow-auto">
              {allProducts.map((pr) => {
                const it = doc.items.find((i) => i.productId === pr.id);
                return (
                  <label key={pr.id} className="flex items-center gap-2 rounded border px-2 py-1 text-xs" style={line}>
                    <input
                      type="checkbox"
                      checked={!!it}
                      onChange={(e) =>
                        patch((d) => ({ ...d, items: e.target.checked ? [...d.items, { productId: pr.id, kind: 'product', order: d.items.length }] : d.items.filter((i) => i.productId !== pr.id) }))
                      }
                    />
                    {pr.coverUrl ? <img src={pr.coverUrl} alt="" className="h-8 w-8 rounded object-cover" /> : <span className="h-8 w-8 rounded bg-neutral-100" />}
                    <span className="min-w-0 flex-1 truncate">
                      {pr.name} <span className="font-mono opacity-60">{pr.sku}</span> NT$ {pr.price}
                      {!pr.isActive ? <span className="ml-1 rounded bg-neutral-200 px-1 text-[10px]">已下架</span> : null}
                    </span>
                    {it ? (
                      <select className="rounded border px-1 py-0.5" style={line} value={it.kind} onChange={(e) => patch((d) => ({ ...d, items: d.items.map((i) => (i.productId === pr.id ? { ...i, kind: e.target.value as SalesItemKind } : i)) }))}>
                        {SALES_ITEM_KINDS.map((k) => (
                          <option key={k.key} value={k.key}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </label>
                );
              })}
              {!allProducts.length ? <p style={{ color: 'var(--muted)' }}>尚無商品，先到「電商 → 商品」建立。</p> : null}
            </div>
          </Card>
          <Card title="產品區塊設定" desc="可更改各區塊的顯示與標題；強制關閉的區塊不會顯示。">
            {SALES_ITEM_KINDS.map((k) => (
              <div key={k.key} className="mb-2 grid grid-cols-[auto_1fr] items-center gap-2">
                <Toggle label={`啟用${k.label}`} checked={doc.sections.enabled[k.key]} onChange={(v) => set('sections', { enabled: { ...doc.sections.enabled, [k.key]: v } })} />
                <input className={input} style={line} value={doc.sections.titles[k.key]} onChange={(e) => set('sections', { titles: { ...doc.sections.titles, [k.key]: e.target.value } })} placeholder={`${k.label}標題`} />
              </div>
            ))}
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              已掛載 {doc.items.length} 個商品：{SALES_ITEM_KINDS.map((k) => `${k.label} ${doc.items.filter((i) => i.kind === k.key).length}`).join('、')}。標籤（例：新品／限量）可在「順序」頁設定。
            </p>
          </Card>
        </div>
      ) : null}

      {tab === 'form' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="下單方式" desc="多步驟：購物流程優化；一步下單：Google 表單模式，對高年齡層較容易。">
            <select className={input} style={line} value={doc.form.mode} onChange={(e) => set('form', { mode: e.target.value as SalesPageDoc['form']['mode'] })}>
              <option value="multi">多步驟下單</option>
              <option value="one">一步下單（直接顯示結帳表單）</option>
              <option value="one-after-click">一步下單（按開始結帳後顯示表單）</option>
            </select>
            <Field label="結帳會員登入">
              <select className={input} style={line} value={doc.form.memberLogin} onChange={(e) => set('form', { memberLogin: e.target.value as SalesPageDoc['form']['memberLogin'] })}>
                <option value="optional">顯示會員登入（可選）</option>
                <option value="required">強制顧客登入</option>
                <option value="hidden">不顯示會員登入</option>
              </select>
            </Field>
            <Toggle label="優惠結帳倒數" checked={doc.form.checkoutCountdown.enabled} onChange={(v) => set('form', { checkoutCountdown: { ...doc.form.checkoutCountdown, enabled: v } })} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="分鐘">
                <input type="number" className={input} style={line} value={doc.form.checkoutCountdown.minutes} onChange={(e) => set('form', { checkoutCountdown: { ...doc.form.checkoutCountdown, minutes: Number(e.target.value) || 10 } })} />
              </Field>
              <Field label="文字">
                <input className={input} style={line} value={doc.form.checkoutCountdown.text} onChange={(e) => set('form', { checkoutCountdown: { ...doc.form.checkoutCountdown, text: e.target.value } })} />
              </Field>
            </div>
            <Toggle label="啟用下單說明" checked={doc.form.note.enabled} onChange={(v) => set('form', { note: { ...doc.form.note, enabled: v } })} />
            <textarea className={input} style={line} rows={3} value={doc.form.note.text} onChange={(e) => set('form', { note: { ...doc.form.note, text: e.target.value } })} placeholder="顧客開始下單會看到的提示" />
          </Card>
          <Card title="聯絡電話／Email／收貨時間" desc="可更改欄位名稱、說明與驗證方式。超商取貨必須填手機，建議只接受手機。">
            <div className="grid grid-cols-2 gap-2">
              <Field label="聯絡電話名稱">
                <input className={input} style={line} value={doc.form.phone.label} onChange={(e) => set('form', { phone: { ...doc.form.phone, label: e.target.value } })} />
              </Field>
              <Field label="驗證">
                <select className={input} style={line} value={doc.form.phone.rule} onChange={(e) => set('form', { phone: { ...doc.form.phone, rule: e.target.value as SalesPageDoc['form']['phone']['rule'] } })}>
                  <option value="none">不使用</option>
                  <option value="mobile">只接受手機</option>
                  <option value="landline">只接受市話</option>
                  <option value="any">手機或市話</option>
                </select>
              </Field>
              <Field label="Email 名稱">
                <input className={input} style={line} value={doc.form.email.label} onChange={(e) => set('form', { email: { ...doc.form.email, label: e.target.value } })} />
              </Field>
              <Field label="Email 必填">
                <select className={input} style={line} value={doc.form.email.required ? '1' : '0'} onChange={(e) => set('form', { email: { ...doc.form.email, required: e.target.value === '1' } })}>
                  <option value="1">是</option>
                  <option value="0">否</option>
                </select>
              </Field>
            </div>
            <Toggle label="開啟「方便收貨時間」欄位（超商取貨不顯示）" checked={doc.form.deliveryTime.enabled} onChange={(v) => set('form', { deliveryTime: { ...doc.form.deliveryTime, enabled: v } })} />
            <Toggle label="統一發票欄位" checked={doc.form.invoice} onChange={(v) => set('form', { invoice: v })} />
            <Toggle label="優惠券（折扣碼）欄位" checked={doc.form.coupon} onChange={(v) => set('form', { coupon: v })} />
            <Toggle label="結帳需勾選同意隱私權政策" checked={doc.form.privacy} onChange={(v) => set('form', { privacy: v })} />
          </Card>
          <Card title="自訂欄位" desc="結帳時額外收集的資料。">
            {doc.form.customFields.map((f, i) => (
              <div key={i} className="mb-1 grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-1 text-xs">
                <input className={input} style={line} value={f.label} placeholder="欄位名稱" onChange={(e) => set('form', { customFields: doc.form.customFields.map((x, k) => (k === i ? { ...x, label: e.target.value, key: x.key || `f${i + 1}` } : x)) })} />
                <input className={input} style={line} value={f.options?.join('／') ?? ''} placeholder="選項（下拉用，／分隔）" onChange={(e) => set('form', { customFields: doc.form.customFields.map((x, k) => (k === i ? { ...x, options: e.target.value.split('／').map((s) => s.trim()).filter(Boolean) } : x)) })} />
                <select className="rounded border px-1 py-1" style={line} value={f.type} onChange={(e) => set('form', { customFields: doc.form.customFields.map((x, k) => (k === i ? { ...x, type: e.target.value as SalesPageDoc['form']['customFields'][number]['type'] } : x)) })}>
                  <option value="text">單行</option>
                  <option value="textarea">多行</option>
                  <option value="select">下拉</option>
                  <option value="checkbox">勾選</option>
                </select>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={f.required} onChange={(e) => set('form', { customFields: doc.form.customFields.map((x, k) => (k === i ? { ...x, required: e.target.checked } : x)) })} />
                  必填
                </label>
                <button className="text-red-700" onClick={() => set('form', { customFields: doc.form.customFields.filter((_, k) => k !== i) })}>
                  移除
                </button>
              </div>
            ))}
            <button className="rounded border px-2 py-1 text-xs" style={line} onClick={() => set('form', { customFields: [...doc.form.customFields, { key: `f${doc.form.customFields.length + 1}`, label: '', type: 'text', required: false }] })}>
              ＋ 新增
            </button>
          </Card>
        </div>
      ) : null}

      {tab === 'order' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="銷售頁區塊順序" desc="調整每個區塊在頁面上的順序（上下移）。">
            {doc.sections.order.map((k, i) => (
              <div key={k} className="mb-1 flex items-center gap-2 rounded border px-2 py-1 text-xs" style={line}>
                <span className="w-6 opacity-60">#{i + 1}</span>
                <span className="flex-1">
                  {SALES_SECTIONS.find((s) => s.key === k)?.label ?? k}
                  {k === 'content' && !doc.content ? <span className="ml-1 opacity-60">（未建立內文）</span> : null}
                  {['offer', 'bundle', 'product', 'addon'].includes(k) && !doc.sections.enabled[k as SalesItemKind] ? <span className="ml-1 opacity-60">（未啟用）</span> : null}
                </span>
                <button className="rounded border px-2" style={line} disabled={i === 0} onClick={() => set('sections', { order: move(doc.sections.order, i, -1) as SalesSectionKey[] })}>
                  ↑
                </button>
                <button className="rounded border px-2" style={line} disabled={i === doc.sections.order.length - 1} onClick={() => set('sections', { order: move(doc.sections.order, i, 1) as SalesSectionKey[] })}>
                  ↓
                </button>
              </div>
            ))}
          </Card>
          <Card title="產品順序與標籤" desc="建議把主力優惠／產品往前放。標籤會顯示在商品圖左上角。">
            {items.map((it, i) => {
              const pr = productOf(it.productId);
              return (
                <div key={it.productId} className="mb-1 flex items-center gap-2 rounded border px-2 py-1 text-xs" style={line}>
                  <span className="w-6 opacity-60">#{i + 1}</span>
                  <span className="rounded bg-neutral-100 px-1">{SALES_ITEM_KINDS.find((k) => k.key === it.kind)?.label}</span>
                  <span className="min-w-0 flex-1 truncate">{pr?.name ?? it.productId}</span>
                  <input className="w-24 rounded border px-1 py-0.5" style={line} value={it.badge ?? ''} placeholder="標籤" onChange={(e) => patch((d) => ({ ...d, items: d.items.map((x) => (x.productId === it.productId ? { ...x, badge: e.target.value } : x)) }))} />
                  <button className="rounded border px-2" style={line} disabled={i === 0} onClick={() => patch((d) => ({ ...d, items: reorder(items, i, -1) }))}>
                    ↑
                  </button>
                  <button className="rounded border px-2" style={line} disabled={i === items.length - 1} onClick={() => patch((d) => ({ ...d, items: reorder(items, i, 1) }))}>
                    ↓
                  </button>
                </div>
              );
            })}
            {!items.length ? <p className="text-xs" style={{ color: 'var(--muted)' }}>尚未掛載商品（到「銷售（產品）」勾選）。</p> : null}
          </Card>
        </div>
      ) : null}

      {tab === 'tracking' ? (
        <div className="space-y-2">
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            此銷售頁專用的追蹤設定；留空的欄位沿用「網站設定 → 追蹤」。自動事件：PageView、ViewContent（看到產品）、AddToCart、InitiateCheckout、Purchase。
          </p>
          <TrackingFields inherit value={doc.tracking} onChange={(t) => patch({ tracking: t })} />
        </div>
      ) : null}

      {tab === 'seo' ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="SEO 設定" desc="搜尋結果與社群分享的標題／描述／封面（1.9:1，例 1200×630）。">
            <Field label="標題">
              <input className={input} style={line} value={doc.seo.title} onChange={(e) => set('seo', { title: e.target.value })} placeholder={meta.title} />
            </Field>
            <Field label="描述">
              <textarea className={input} style={line} rows={2} value={doc.seo.description} onChange={(e) => set('seo', { description: e.target.value })} />
            </Field>
            <Field label="封面圖片網址">
              <input className={input} style={line} value={doc.seo.ogImage} onChange={(e) => set('seo', { ogImage: e.target.value })} />
            </Field>
            <Field label="網址圖標（favicon，正方形 ≥512px）">
              <input className={input} style={line} value={doc.seo.favicon} onChange={(e) => set('seo', { favicon: e.target.value })} />
            </Field>
          </Card>
          <Card title="主色調／背景／風格" desc="主色調改變選購／結帳按鈕與重要文字顏色；背景會把內文與產品區底色改為白色。">
            <div className="grid grid-cols-2 gap-2">
              <Field label="主色調">
                <input className={input} style={line} value={doc.theme.primaryColor} onChange={(e) => set('theme', { primaryColor: e.target.value })} placeholder="沿用網站主色，例 #e11d48" />
              </Field>
              <Field label="背景類型">
                <select className={input} style={line} value={doc.theme.background.type} onChange={(e) => set('theme', { background: { ...doc.theme.background, type: e.target.value as 'none' | 'color' | 'image' } })}>
                  <option value="none">不使用</option>
                  <option value="color">顏色</option>
                  <option value="image">圖片網址</option>
                </select>
              </Field>
              <Field label="背景值（色碼或圖片網址）">
                <input className={input} style={line} value={doc.theme.background.value} onChange={(e) => set('theme', { background: { ...doc.theme.background, value: e.target.value } })} />
              </Field>
              <Field label="內文最大寬度（px，600–1000）">
                <input type="number" className={input} style={line} value={doc.theme.maxWidth} onChange={(e) => set('theme', { maxWidth: Number(e.target.value) || 800 })} />
              </Field>
              <Field label="最上方留白（px，0–100）">
                <input type="number" className={input} style={line} value={doc.theme.topPadding} onChange={(e) => set('theme', { topPadding: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
              </Field>
            </div>
            <Field label="自訂 CSS（優先次序最高）">
              <textarea className={`${input} font-mono`} style={line} rows={4} value={doc.theme.customCss} onChange={(e) => set('theme', { customCss: e.target.value })} />
            </Field>
          </Card>
        </div>
      ) : null}

      {publishOpen ? (
        <Modal title="確認發佈到線上" onClose={() => setPublishOpen(false)}>
          <PublishBody
            data={data}
            onBefore={() => save(true)}
            onClose={() => setPublishOpen(false)}
            onPublished={(j) => {
              setPublishOpen(false);
              setData((d) => ({ ...d, dirty: false, page: { ...d.page, status: 'published', version: j.version, state: 'open' } }));
              setSaving('saved');
              setMsg(`已發佈為第 ${j.version} 版${j.backedUpVersion !== null ? `（上一版已備份為第 ${j.backedUpVersion} 版）` : ''}：${j.url}`);
              router.refresh();
            }}
          />
        </Modal>
      ) : null}
      {revOpen ? (
        <Modal title={`版本紀錄（線上目前 v${p.version}）`} onClose={() => setRevOpen(false)}>
          {revisions === null ? (
            <p>載入中…</p>
          ) : !revisions.length ? (
            <p className="text-xs">尚無歷史版本（第一次發佈後才會產生備份）。</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {revisions.map((r) => (
                <li key={r.version} className="flex items-center gap-2 border-t py-1" style={line}>
                  <span className="font-semibold">v{r.version}</span>
                  <span className="flex-1">
                    {r.title} <span className="font-mono opacity-60">/{r.slug}</span> · {new Date(r.createdAt).toLocaleString('zh-TW')} · {r.createdBy ?? '—'}
                    {r.note ? ` · ${r.note}` : ''}
                  </span>
                  <button onClick={() => restore(r.version)} className="rounded border px-2 py-0.5" style={line}>
                    還原到草稿
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      ) : null}
    </div>
  );
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const a = [...arr];
  const j = i + dir;
  if (j < 0 || j >= a.length) return a;
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}
function reorder(items: SalesPageDoc['items'], i: number, dir: -1 | 1) {
  return move(items, i, dir).map((it, n) => ({ ...it, order: n }));
}
function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)', background: 'var(--card)' }}>
      <h3 className="text-sm font-bold">{title}</h3>
      {desc ? (
        <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
          {desc}
        </p>
      ) : null}
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      {label}
      {children}
    </label>
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl border bg-white p-4 shadow-xl" style={line} onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">{title}</h2>
          <button onClick={onClose} className="rounded border px-2 py-0.5 text-xs" style={line}>
            關閉
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function PublishBody({ data, onBefore, onClose, onPublished }: { data: SalesPayload; onBefore: () => Promise<SalesPayload | null>; onClose: () => void; onPublished: (j: { version: number; backedUpVersion: number | null; url: string }) => void }) {
  const [lint, setLint] = useState(data.lint);
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    onBefore().then((d) => d && setLint(d.lint));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const errors = lint.filter((l) => l.level === 'error');
  const warns = lint.filter((l) => l.level === 'warn');
  const p = data.page;
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border p-3 text-xs" style={line}>
        <div>
          銷售頁：<strong>{p.title}</strong> <span className="font-mono">/s/{p.slug}</span>
        </div>
        <div className="mt-1">{p.status === 'published' ? <>線上目前為第 {p.version} 版，發佈後成為第 {p.version + 1} 版；第 {p.version} 版會先備份到「版本」。</> : <>此頁尚未上線；發佈後前台立即可存取（依排程／密碼設定）。</>}</div>
      </div>
      {errors.length ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
          <div className="font-semibold">發佈前檢測未通過：</div>
          <ul className="list-disc pl-4">
            {errors.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {warns.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <ul className="list-disc pl-4">
            {warns.map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <label className="block text-xs">
        版本備註（選填）
        <input className={input} style={line} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
        <span>我已在沙盒預覽確認過草稿內容無誤，了解發佈會立即變更線上頁面（上一版會自動備份）。</span>
      </label>
      {err ? <p className="text-xs text-red-700">{err}</p> : null}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded border px-3 py-1.5 text-xs" style={line}>
          取消
        </button>
        <button
          onClick={async () => {
            setBusy(true);
            setErr('');
            const r = await fetch(`/api/admin/sales/${p.id}/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: true, note }) });
            const j = await r.json().catch(() => ({}));
            setBusy(false);
            if (!r.ok) return setErr(typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j));
            onPublished(j);
          }}
          disabled={busy || !checked || errors.length > 0}
          className="rounded bg-black px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {busy ? '發佈中…' : '確認發佈'}
        </button>
      </div>
    </div>
  );
}

'use client';

import { fmtDateTime } from '@/lib/api-public';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AdminTemplate {
  id: string;
  key: string;
  name: string;
  category: string;
  description: string | null;
  systemPrompt: string;
  inputFields: unknown[];
  defaultSize: string;
  costPoints: number;
  highCostPoints: number;
  isActive: boolean;
  sortOrder: number;
}
export interface AdminJob {
  id: string;
  status: string;
  provider: string | null;
  byok: boolean;
  costPoints: number;
  costTwd: string | null;
  error: string | null;
  createdAt: string;
  user: { email: string };
  template: { name: string } | null;
}

const input = 'w-full rounded border px-2 py-1 text-xs';
const EMPTY = { key: '', name: '', category: 'general', description: '', systemPrompt: '', inputFields: '[{ "key": "product_name", "label": "商品名稱", "type": "text", "required": true }, { "key": "reference_images", "label": "商品圖／服務圖", "type": "image" }]', defaultSize: '1024x1024', costPoints: 5, highCostPoints: 15, isActive: true, sortOrder: 100 };

/** 模板 CRUD（systemPrompt 只在這裡看得到）與任務列表。 */
export function AdminStudioClient({ templates, jobs }: { templates: AdminTemplate[]; jobs: AdminJob[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState('');

  function open(t?: AdminTemplate) {
    setEditing(t ? t.id : 'new');
    setF(t ? { key: t.key, name: t.name, category: t.category, description: t.description ?? '', systemPrompt: t.systemPrompt, inputFields: JSON.stringify(t.inputFields, null, 1), defaultSize: t.defaultSize, costPoints: t.costPoints, highCostPoints: t.highCostPoints, isActive: t.isActive, sortOrder: t.sortOrder } : EMPTY);
    setMsg('');
  }
  async function save() {
    let inputFields: unknown;
    try {
      inputFields = JSON.parse(f.inputFields || '[]');
    } catch {
      return setMsg('inputFields 不是合法 JSON');
    }
    const body = { ...f, description: f.description || null, inputFields, costPoints: Number(f.costPoints), highCostPoints: Number(f.highCostPoints), sortOrder: Number(f.sortOrder) };
    const r = await fetch(editing === 'new' ? '/api/admin/studio/templates' : `/api/admin/studio/templates/${editing}`, { method: editing === 'new' ? 'POST' : 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? '已儲存' : `失敗：${typeof j.message === 'string' ? j.message : JSON.stringify(j.message ?? j)}`);
    if (r.ok) {
      setEditing(null);
      router.refresh();
    }
  }
  async function remove(id: string) {
    if (!window.confirm('刪除模板？')) return;
    await fetch(`/api/admin/studio/templates/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="space-y-6 text-xs">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">模板</p>
          <button onClick={() => open()} className="rounded bg-black px-3 py-1 text-white">
            新增模板
          </button>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr style={{ color: 'var(--muted)' }}>
              <th className="py-1">key</th>
              <th className="py-1">名稱</th>
              <th className="py-1">分類</th>
              <th className="py-1">狀態</th>
              <th className="py-1"></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="py-1 font-mono">{t.key}</td>
                <td className="py-1">{t.name}</td>
                <td className="py-1">{t.category}</td>
                <td className="py-1">{t.isActive ? '啟用' : '停用'}</td>
                <td className="py-1">
                  <button onClick={() => open(t)} className="mr-2 underline">
                    編輯
                  </button>
                  <button onClick={() => remove(t.id)} className="underline">
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {editing ? (
          <div className="mt-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-2" style={{ borderColor: 'var(--line)' }}>
            <label>
              key（英數底線）
              <input className={input} style={{ borderColor: 'var(--line)' }} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} />
            </label>
            <label>
              名稱
              <input className={input} style={{ borderColor: 'var(--line)' }} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </label>
            <label>
              分類
              <input className={input} style={{ borderColor: 'var(--line)' }} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
            </label>
            <label>
              預設尺寸
              <select className={input} style={{ borderColor: 'var(--line)' }} value={f.defaultSize} onChange={(e) => setF({ ...f, defaultSize: e.target.value })}>
                {['1024x1024', '1536x1024', '1024x1536'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2">
              描述
              <input className={input} style={{ borderColor: 'var(--line)' }} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </label>
            <label className="sm:col-span-2">
              systemPrompt（只有後台看得到）
              <textarea className={input} style={{ borderColor: 'var(--line)' }} rows={4} value={f.systemPrompt} onChange={(e) => setF({ ...f, systemPrompt: e.target.value })} />
            </label>
            <label className="sm:col-span-2">
              inputFields（JSON 陣列：key、label、type text/textarea/select、required、placeholder、options）
              <textarea className={`${input} font-mono`} style={{ borderColor: 'var(--line)' }} rows={5} value={f.inputFields} onChange={(e) => setF({ ...f, inputFields: e.target.value })} />
            </label>
            <label>
              排序
              <input className={input} style={{ borderColor: 'var(--line)' }} type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-1 self-end">
              <input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> 啟用
            </label>
            <div className="flex items-center gap-2 sm:col-span-2">
              <button onClick={save} className="rounded bg-black px-3 py-1 text-white">
                儲存
              </button>
              <button onClick={() => setEditing(null)} className="rounded border px-3 py-1" style={{ borderColor: 'var(--line)' }}>
                取消
              </button>
              <span style={{ color: 'var(--muted)' }}>{msg}</span>
            </div>
          </div>
        ) : null}
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">最近任務</p>
        <table className="w-full text-left">
          <thead>
            <tr style={{ color: 'var(--muted)' }}>
              <th className="py-1">時間</th>
              <th className="py-1">用戶</th>
              <th className="py-1">模板</th>
              <th className="py-1">供應商</th>
              <th className="py-1">狀態</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="py-1">{fmtDateTime(j.createdAt)}</td>
                <td className="py-1">{j.user.email}</td>
                <td className="py-1">{j.template?.name ?? '自由提示詞'}</td>
                <td className="py-1">
                  {j.provider}
                </td>
                <td className="py-1">
                  {j.status}
                  {j.error ? <span className="text-red-700"> {j.error}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

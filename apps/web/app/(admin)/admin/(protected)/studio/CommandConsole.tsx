"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OPS_ACTIONS } from "@sitekit/shared";

interface Task {
  key: string;
  group?: string;
  label: string;
  desc: string;
  examples: string[];
}
export interface CommandConfig {
  provider: "mock" | "anthropic" | "openai" | "gemini";
  model: string;
  ready: boolean;
  anthropicConfigured: boolean;
  openaiConfigured: boolean;
  geminiConfigured?: boolean;
  tasks: Task[];
  actions: { action: string; desc: string; mutating: boolean }[];
}
interface Step {
  action: string;
  params: Record<string, unknown>;
  desc: string;
}
interface Exec {
  action: string;
  params: Record<string, unknown>;
  ok: boolean;
  data?: unknown;
  error?: string;
}
type Turn =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      executed?: Exec[];
      pending?: Step[];
      token?: string;
      confirmed?: Exec[];
      canceled?: boolean;
    }
  | { role: "system"; text: string };

const line = { borderColor: "var(--line)" } as const;
const input = "w-full rounded border px-2 py-1 text-sm";
const KEY = "sitekit.command.transcript";

/**
 * AI 指令台（後台全站工作總控）：自然語言 → 唯讀動作即時執行、寫入動作列成待確認清單 → 管理員按「確認執行」才真的改資料。
 * 系統功能（部署／遷移／設定／管理員）不在此開放。
 */
export interface SiteStatus {
  templateName?: string;
  templateId?: string;
  themeMode?: string;
  unreadMessages?: number;
  openQuestions?: number;
}

export function CommandConsole({
  config: initial,
  imageStudio,
  status,
}: {
  config: CommandConfig;
  imageStudio?: React.ReactNode;
  status?: SiteStatus;
}) {
  const router = useRouter();
  const [config, setConfig] = useState(initial);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(!initial.ready);
  const [task, setTask] = useState<string>(initial.tasks[0]?.key ?? "");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setTurns(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-40)));
    } catch {
      /* ignore */
    }
    bottom.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  const history = () =>
    turns
      .filter(
        (t): t is Extract<Turn, { role: "user" | "assistant" }> =>
          t.role !== "system",
      )
      .slice(-12)
      .map((t) => ({
        role: t.role,
        text:
          t.role === "assistant"
            ? t.text +
              (t.confirmed
                ? `\n[已執行] ${t.confirmed.map((c) => `${c.action}${c.ok ? " ✓" : " ✗ " + c.error}`).join("，")}`
                : t.canceled
                  ? "\n[使用者取消了待確認動作]"
                  : t.pending?.length
                    ? "\n[待確認動作尚未執行]"
                    : "")
            : t.text,
      }));

  async function send(msg?: string) {
    const message = (msg ?? text).trim();
    if (!message || busy) return;
    setText("");
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text: message }]);
    try {
      const r = await fetch("/api/admin/ai/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history: history() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok)
        setTurns((t) => [
          ...t,
          {
            role: "system",
            text: `失敗：${typeof j.message === "string" ? j.message : JSON.stringify(j.message ?? j)}`,
          },
        ]);
      else
        setTurns((t) => [
          ...t,
          {
            role: "assistant",
            text: j.reply,
            executed: j.executed,
            pending: j.pending,
            token: j.token,
          },
        ]);
    } catch (e) {
      setTurns((t) => [
        ...t,
        {
          role: "system",
          text: `失敗：${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    }
    setBusy(false);
  }
  async function confirm(idx: number) {
    const turn = turns[idx];
    if (turn.role !== "assistant" || !turn.token) return;
    setBusy(true);
    const r = await fetch("/api/admin/ai/command/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: turn.token }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok)
      return setTurns((t) => [
        ...t,
        {
          role: "system",
          text: `確認失敗：${typeof j.message === "string" ? j.message : JSON.stringify(j.message ?? j)}`,
        },
      ]);
    setTurns((t) =>
      t.map((x, i) =>
        i === idx && x.role === "assistant"
          ? { ...x, confirmed: j.results, token: undefined }
          : x,
      ),
    );
    setTurns((t) => [...t, { role: "system", text: `已執行：\n${j.summary}` }]);
    router.refresh();
  }
  function cancel(idx: number) {
    setTurns((t) =>
      t.map((x, i) =>
        i === idx && x.role === "assistant"
          ? { ...x, canceled: true, token: undefined }
          : x,
      ),
    );
  }
  async function saveSettings(s: {
    provider: string;
    model: string;
    anthropicKey: string;
    openaiKey: string;
    geminiKey: string;
  }) {
    const settings: Record<string, string> = {
      "ai.commandProvider": s.provider,
      "ai.commandModel": s.model,
    };
    if (s.anthropicKey.trim())
      settings["anthropic.apiKey"] = s.anthropicKey.trim();
    if (s.openaiKey.trim()) settings["openai.apiKey"] = s.openaiKey.trim();
    if (s.geminiKey.trim()) settings["gemini.apiKey"] = s.geminiKey.trim();
    await fetch("/api/admin/ai/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "update_settings", params: { settings } }),
    });
    const c = await fetch("/api/admin/ai/command/config").then((r) => r.json());
    setConfig(c);
    setSettingsOpen(false);
  }

  const cur = config.tasks.find((t) => t.key === task);
  const chat = (
    <section
      className="flex min-h-[70vh] flex-col rounded-lg border"
      style={line}
    >
      <div
        className="flex flex-wrap items-center gap-2 border-b p-2 text-xs"
        style={line}
      >
        <span
          className={`rounded px-2 py-0.5 ${config.ready ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
        >
          {config.provider === "mock"
            ? "mock 規則模式（示範／測試，不花錢）"
            : `${config.provider} · ${config.model}`}
          {config.ready ? "" : "（未設定金鑰）"}
        </span>
        <button
          onClick={() => setSettingsOpen((o) => !o)}
          className="rounded border px-2 py-0.5"
          style={line}
        >
          設定
        </button>
        <button
          onClick={() => {
            setTurns([]);
            sessionStorage.removeItem(KEY);
          }}
          className="ml-auto rounded border px-2 py-0.5"
          style={line}
        >
          清除對話
        </button>
      </div>
      {settingsOpen ? (
        <Settings
          config={config}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      <div className="flex-1 space-y-3 overflow-auto p-3 text-sm">
        {!turns.length ? (
          <div
            className="rounded-lg border border-dashed p-4 text-xs"
            style={{ ...line, color: "var(--muted)" }}
          >
            <p className="font-semibold">這裡是後台全站工作總控。</p>
            <p className="mt-1">
              用一句話描述要做的事（左側有範例）。我會先查資料，再把要「改動」的動作列出來給你確認；頁面一律先存草稿、給預覽連結，你確認後才發佈。套版、首頁區塊、選單屬整份覆寫，我會說明影響與還原方式。
            </p>
          </div>
        ) : null}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div
              key={i}
              className="ml-auto max-w-[80%] rounded-xl bg-black px-3 py-2 text-white"
            >
              {t.text}
            </div>
          ) : t.role === "system" ? (
            <pre
              key={i}
              className="whitespace-pre-wrap rounded-lg bg-neutral-100 px-3 py-2 text-xs"
            >
              {t.text}
            </pre>
          ) : (
            <div key={i} className="max-w-[92%] space-y-2">
              <div
                className="whitespace-pre-wrap rounded-xl border px-3 py-2"
                style={{ ...line, background: "var(--card)" }}
              >
                <Linkify text={t.text} />
              </div>
              {t.executed?.length ? (
                <div className="space-y-1">
                  {t.executed.map((e, k) => (
                    <ResultCard key={k} r={e} label="已查詢" />
                  ))}
                </div>
              ) : null}
              {t.pending?.length ? (
                <div
                  className={`rounded-lg border p-2 text-xs ${t.confirmed ? "border-green-300 bg-green-50" : t.canceled ? "opacity-60" : "border-amber-300 bg-amber-50"}`}
                >
                  <div className="mb-1 font-semibold">
                    {t.confirmed
                      ? "已執行的動作"
                      : t.canceled
                        ? "已取消"
                        : `待確認動作（${t.pending.length}）— 按下確認才會改動資料`}
                  </div>
                  <ol className="list-decimal space-y-1 pl-5">
                    {t.pending.map((s, k) => (
                      <li key={k}>
                        <span className="font-mono font-semibold">
                          {s.action}
                        </span>{" "}
                        <span style={{ color: "var(--muted)" }}>
                          {OPS_ACTIONS[s.action as keyof typeof OPS_ACTIONS]
                            ?.desc ?? s.desc}
                        </span>
                        {s.action === "set_home_sections" ? (
                          <SectionsDiff
                            before={
                              ((t.executed ?? []).find((e) => e.action === "get_site")?.data as { home?: { sections?: { kind: string }[] } } | undefined)?.home?.sections?.map((x) => x.kind) ?? null
                            }
                            after={(Array.isArray(s.params.sections) ? (s.params.sections as { kind: string }[]) : []).map((x) => x.kind)}
                          />
                        ) : null}
                        {s.action === "apply_site_template" || s.action === "quick_setup_site" ? (
                          <p className="mt-1 text-[11px] text-amber-800">會覆寫主題、首頁區塊、選單並建立同名子頁；商品／課程／文章不動；可用 restore 還原。</p>
                        ) : null}
                        <details>
                          <summary
                            className="cursor-pointer"
                            style={{ color: "var(--muted)" }}
                          >
                            參數
                          </summary>
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-1 font-mono text-[11px]">
                            {JSON.stringify(s.params, null, 1)}
                          </pre>
                        </details>
                      </li>
                    ))}
                  </ol>
                  {t.token ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => confirm(i)}
                        disabled={busy}
                        className="rounded bg-black px-3 py-1 font-semibold text-white disabled:opacity-50"
                      >
                        確認執行
                      </button>
                      <button
                        onClick={() => cancel(i)}
                        disabled={busy}
                        className="rounded border px-3 py-1"
                        style={line}
                      >
                        取消
                      </button>
                    </div>
                  ) : null}
                  {t.confirmed?.length ? (
                    <div className="mt-2 space-y-1">
                      {t.confirmed.map((e, k) => (
                        <ResultCard key={k} r={e} label="結果" />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>
      <form
        className="flex gap-2 border-t p-2"
        style={line}
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          className={`${input} min-h-[2.5rem]`}
          style={line}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="輸入指令，例如：列出分類是服飾的商品（Enter 送出，Shift+Enter 換行）"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "處理中…" : "送出"}
        </button>
      </form>
    </section>
  );
  return (
    <div className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="space-y-2 text-xs">
        {status ? (
          <div className="rounded-lg border p-2" style={line} data-site-status>
            <div className="mb-1 font-semibold">站台狀態</div>
            <ul className="space-y-0.5" style={{ color: "var(--muted)" }}>
              <li>
                版型：<b style={{ color: "var(--fg)" }}>{status.templateName ?? "未套用"}</b>
                {status.themeMode ? `（${status.themeMode === "dark" ? "深色" : "淺色"}）` : ""}
              </li>
              <li>
                未讀表單訊息：<b style={{ color: (status.unreadMessages ?? 0) > 0 ? "#b45309" : "var(--fg)" }}>{status.unreadMessages ?? 0}</b>
              </li>
              <li>
                未回覆提問：<b style={{ color: (status.openQuestions ?? 0) > 0 ? "#b45309" : "var(--fg)" }}>{status.openQuestions ?? 0}</b>
              </li>
            </ul>
          </div>
        ) : null}
        <div className="rounded-lg border p-2" style={line}>
          <div className="mb-1 flex items-center justify-between">
            <span className="font-semibold">工作項目</span>
          </div>
          {Array.from(new Set(config.tasks.map((t) => t.group ?? ""))).map((g) => (
            <div key={g} className="mb-1">
              {g ? <div className="px-2 pt-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>{g}</div> : null}
              {config.tasks.filter((t) => (t.group ?? "") === g).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTask(t.key)}
                  className={`block w-full rounded px-2 py-1 text-left ${task === t.key ? "bg-black text-white" : "hover:bg-neutral-100"}`}
                  data-task={t.key}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        {cur ? (
          <div className="rounded-lg border p-2" style={line}>
            <div className="font-semibold">{cur.label}</div>
            <p style={{ color: "var(--muted)" }}>{cur.desc}</p>
            <div className="mt-1 space-y-1">
              {cur.examples.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setText(ex)}
                  className="block w-full rounded border px-2 py-1 text-left hover:bg-neutral-50"
                  style={line}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="rounded-lg border p-2" style={line}>
          <div className="font-semibold">
            可操作的動作（{config.actions.length}）
          </div>
          <p style={{ color: "var(--muted)" }}>
            唯讀立即執行；寫入需你按「確認執行」。系統功能不開放。
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer">展開清單</summary>
            <ul className="mt-1 space-y-0.5">
              {config.actions.map((a) => (
                <li key={a.action}>
                  <span
                    className={`mr-1 rounded px-1 text-[10px] ${a.mutating ? "bg-amber-100 text-amber-800" : "bg-neutral-100"}`}
                  >
                    {a.mutating ? "寫" : "讀"}
                  </span>
                  <span className="font-mono">{a.action}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </aside>

      {task === "image" && imageStudio ? (
        <div className="space-y-3">
          {imageStudio}
          <details className="rounded-lg border" style={line}>
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">
              改用對話指令產圖（例：幫 SKU DEMO-MUG 產生白底主圖並設成封面）
            </summary>
            <div className="p-2">{chat}</div>
          </details>
        </div>
      ) : (
        chat
      )}
    </div>
  );
}

/** 首頁區塊待確認差異：現況（同回合 get_site）vs 送出的 sections，以 kind 序列比對 */
function SectionsDiff({ before, after }: { before: string[] | null; after: string[] }) {
  if (!before) return <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>新首頁區塊（{after.length}）：{after.join(" → ")}</p>;
  const b = [...before];
  const rows: { kind: string; op: "keep" | "add" | "del" }[] = [];
  for (const k of after) {
    const i = b.indexOf(k);
    if (i >= 0) {
      b.splice(i, 1);
      rows.push({ kind: k, op: "keep" });
    } else rows.push({ kind: k, op: "add" });
  }
  for (const k of b) rows.push({ kind: k, op: "del" });
  return (
    <p className="mt-1 flex flex-wrap gap-1 text-[11px]">
      {rows.map((r, i) => (
        <span key={i} className={`rounded px-1 ${r.op === "add" ? "bg-green-100 text-green-800" : r.op === "del" ? "bg-red-100 text-red-800 line-through" : "bg-neutral-100"}`}>
          {r.op === "add" ? "＋" : r.op === "del" ? "－" : ""}
          {r.kind}
        </span>
      ))}
      <span style={{ color: "var(--muted)" }}>（{before.length} → {after.length} 個區塊）</span>
    </p>
  );
}

function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)）」]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a
            key={i}
            href={p}
            target="_blank"
            rel="noopener"
            className="break-all underline"
          >
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function ResultCard({ r, label }: { r: Exec; label: string }) {
  const d = r.data as Record<string, unknown> | unknown[] | undefined;
  const url =
    d && !Array.isArray(d) && typeof d.url === "string" ? d.url : null;
  const isImg = url && /\.(png|jpe?g|webp|svg|gif)(\?|$)/i.test(url);
  const rows =
    Array.isArray(d) && d.length && typeof d[0] === "object"
      ? (d as Record<string, unknown>[])
      : null;
  const cols = rows
    ? Object.keys(rows[0])
        .filter(
          (k) =>
            ["string", "number", "boolean"].includes(typeof rows[0][k]) ||
            rows[0][k] === null,
        )
        .slice(0, 8)
    : [];
  return (
    <details
      className={`rounded-lg border text-xs ${r.ok ? "" : "border-red-300"}`}
      style={line}
      open={!!isImg || !r.ok}
    >
      <summary className="cursor-pointer px-2 py-1">
        <span
          className={`mr-1 rounded px-1 text-[10px] ${r.ok ? "bg-neutral-100" : "bg-red-100 text-red-800"}`}
        >
          {label}
        </span>
        <span className="font-mono">{r.action}</span>
        {rows ? (
          <span style={{ color: "var(--muted)" }}>（{rows.length} 筆）</span>
        ) : null}
        {!r.ok ? <span className="ml-1 text-red-700">{r.error}</span> : null}
      </summary>
      <div className="max-h-72 overflow-auto p-2">
        {isImg ? (
          <img
            src={url!}
            alt=""
            className="mb-2 max-h-60 rounded border"
            style={line}
          />
        ) : null}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener"
            className="block break-all underline"
          >
            {url}
          </a>
        ) : null}
        {rows ? (
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr style={{ color: "var(--muted)" }}>
                {cols.map((c) => (
                  <th key={c} className="py-0.5 pr-2">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((row, i) => (
                <tr key={i} className="border-t" style={line}>
                  {cols.map((c) => (
                    <td key={c} className="py-0.5 pr-2">
                      {String(row[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : !isImg ? (
          <pre className="whitespace-pre-wrap font-mono text-[11px]">
            {JSON.stringify(r.data ?? r.error, null, 1)?.slice(0, 6000)}
          </pre>
        ) : null}
      </div>
    </details>
  );
}

function Settings({
  config,
  onSave,
  onClose,
}: {
  config: CommandConfig;
  onSave: (s: {
    provider: string;
    model: string;
    anthropicKey: string;
    openaiKey: string;
    geminiKey: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [s, setS] = useState({
    provider: config.provider,
    model: config.model === "rules" ? "" : config.model,
    anthropicKey: "",
    openaiKey: "",
    geminiKey: "",
  });
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [detect, setDetect] = useState<{
    loading: boolean;
    error?: string;
    def?: string;
  }>({ loading: false });
  const detectModels = async (provider = s.provider, key?: string) => {
    if (provider === "mock") {
      setModels([]);
      setDetect({ loading: false });
      return;
    }
    setDetect({ loading: true });
    const r = await fetch("/api/admin/ai/command/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider,
        apiKey:
          key ??
          (provider === "anthropic"
            ? s.anthropicKey
            : provider === "gemini"
              ? s.geminiKey
              : s.openaiKey),
      }),
    });
    const j = await r.json().catch(() => ({ models: [] }));
    setModels(j.models ?? []);
    setDetect({ loading: false, error: j.error, def: j.default });
    if (
      j.models?.length &&
      !j.models.some((m: { id: string }) => m.id === s.model)
    )
      setS((cur) => ({ ...cur, model: j.default ?? j.models[0].id }));
  };
  useEffect(() => {
    void detectModels(s.provider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.provider]);
  return (
    <div
      className="border-b p-3 text-xs"
      style={{ ...line, background: "var(--card)" }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          供應商
          <select
            className={input}
            style={line}
            value={s.provider}
            onChange={(e) =>
              setS({
                ...s,
                provider: e.target.value as CommandConfig["provider"],
              })
            }
          >
            <option value="anthropic">
              Anthropic（Claude，建議；只做文字／非圖像作業）
            </option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
            <option value="mock">mock 規則模式（測試，不花錢）</option>
          </select>
        </label>
        <label className="block">
          模型
          {detect.loading ? (
            <span style={{ color: "var(--muted)" }}>（偵測可用模型中…）</span>
          ) : models.length ? (
            <span className="text-green-700">
              （已自動偵測 {models.length} 個可用模型）
            </span>
          ) : detect.error ? (
            <span className="text-red-700">（{detect.error}）</span>
          ) : (
            <span style={{ color: "var(--muted)" }}>
              （填金鑰後自動偵測；留空用預設）
            </span>
          )}
          {models.length ? (
            <select
              className={input}
              style={line}
              value={s.model}
              onChange={(e) => setS({ ...s, model: e.target.value })}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.id === detect.def ? "（建議）" : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={input}
              style={line}
              value={s.model}
              onChange={(e) => setS({ ...s, model: e.target.value })}
              placeholder={
                s.provider === "openai"
                  ? "gpt-4.1"
                  : s.provider === "gemini"
                    ? "gemini-2.5-pro"
                    : "claude-sonnet-5"
              }
              disabled={s.provider === "mock"}
            />
          )}
        </label>
        <label className="block">
          Anthropic API Key{" "}
          {config.anthropicConfigured ? (
            <span className="text-green-700">（已設定，留空不變）</span>
          ) : null}
          <input
            className={input}
            style={line}
            type="password"
            autoComplete="off"
            value={s.anthropicKey}
            onChange={(e) => setS({ ...s, anthropicKey: e.target.value })}
            onBlur={() =>
              s.provider === "anthropic" &&
              s.anthropicKey &&
              void detectModels("anthropic", s.anthropicKey)
            }
          />
        </label>
        <label className="block">
          Gemini API Key{" "}
          {config.geminiConfigured ? (
            <span className="text-green-700">（已設定，留空不變）</span>
          ) : null}
          （也供 API 產圖使用）
          <input
            className={input}
            style={line}
            type="password"
            autoComplete="off"
            value={s.geminiKey}
            onChange={(e) => setS({ ...s, geminiKey: e.target.value })}
            onBlur={() =>
              s.provider === "gemini" &&
              s.geminiKey &&
              void detectModels("gemini", s.geminiKey)
            }
          />
        </label>
        <label className="block">
          OpenAI API Key{" "}
          {config.openaiConfigured ? (
            <span className="text-green-700">（已設定，留空不變）</span>
          ) : null}
          （也供 API 產圖使用）
          <input
            className={input}
            style={line}
            type="password"
            autoComplete="off"
            value={s.openaiKey}
            onChange={(e) => setS({ ...s, openaiKey: e.target.value })}
            onBlur={() =>
              s.provider === "openai" &&
              s.openaiKey &&
              void detectModels("openai", s.openaiKey)
            }
          />
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onSave(s);
            setBusy(false);
          }}
          className="rounded bg-black px-3 py-1 text-white disabled:opacity-50"
        >
          儲存設定
        </button>
        <button
          onClick={() => void detectModels()}
          disabled={detect.loading || s.provider === "mock"}
          className="rounded border px-3 py-1 disabled:opacity-50"
          style={line}
        >
          重新偵測模型
        </button>
        <button
          onClick={onClose}
          className="rounded border px-3 py-1"
          style={line}
        >
          關閉
        </button>
        <span style={{ color: "var(--muted)" }}>
          金鑰只存在伺服器設定，不會回傳前端。API 產圖只支援 OpenAI 與
          Gemini（依金鑰自動偵測模型）；Claude 只做文字／非圖像作業。
        </span>
      </div>
    </div>
  );
}

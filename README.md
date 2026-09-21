# AIGC創客架站套件（代號 SiteKit）

電商開店／線上課程／品牌網站共用的通用架站骨架。一副骨架長出官網、商城、課程、AI 工作站、會員中心與後台，
部署成 `web`（Next.js）與 `api`（NestJS）兩個可獨立擴展的服務，資料庫用 PostgreSQL。

## 後台雙路徑（本套件核心設計）

| 路徑 | 入口 | 身分驗證 | 用途 | 使用者 |
|---|---|---|---|---|
| **MCP 路徑** | `mcp/server.mjs` → `/api/ops/*` | `Authorization: Bearer <OPS_TOKEN>` | 部署、遷移、設定更新、內容匯入等**維運操作** | 訂閱制 AI 工具（Claude Desktop／Claude Code 等）|
| **AI API 路徑** | 後台工作站 UI → `/api/admin/ai/*` | httpOnly cookie 管理員 session（DB session） | 後台內建 AI 輔助，**只能從工作站後台觸發** | 登入後台的管理員 |

兩條路徑最後都收斂到同一個 `OpsService`：**AI 只操作既有功能，不為 AI 另寫邏輯**；每次會改動狀態的操作都寫入 `audit_logs`（actor 標記 `mcp` 或 `admin-ai:<userId>`）。
MCP 路徑拿不到 cookie session，AI API 路徑不接受 Bearer token，兩者互不相通。

## 目前進度

**P1 地基（完成）**：會員系統（Email 註冊／登入、DB session、首位註冊者＝超級管理員）、內容模組與搬運器 v1（WordPress／CSV → 冪等匯入 → 301 表）、官網 SEO（sitemap、robots、JSON-LD、canonical）、後台工作站、Dockerfile／CI、免 Docker 本機資料庫。

**P2 變現（完成）**：
- 目錄：商品與課程共用 SKU，課程含章節（試看旗標、影片 id）
- 訂單狀態機：pending → paid | failed | canceled；paid → refunded。**授權只在伺服器回呼驗章通過後寫入**
- 金流：藍新 NewebPay MPG（信用卡＋ATM 虛擬帳號、NotifyURL／ReturnURL、CheckCode 二次驗證、金額比對、回呼冪等）；本機 `mock` 假閘道（非 production）
- 退款：用戶申請 → 管理員核准（藍新先 Cancel 再 Close）→ 撤銷授權、作廢發票
- 發票：ezPay B2C 電子發票（`ezpay.enabled=true` 才開立）
- 影片：**YouTube 為預設來源**（後台影片庫選單挑片、自製播放器隱藏 YouTube 介面、公開頁面不露 ID）；Bunny Stream 簽章播放可切換
- 頁面：`/courses`、`/course/[slug]`（封面／試看影片、購買）、`/classroom/[slug]/[chapterId]`（教室：章節樹、進度、完成、上下一個）、`/pay/mock`、`/order-result`、會員訂單與退款申請、後台訂單管理、後台課程管理（課程設定、兩層章節樹拖曳排序、章節抽屜貼網址即預覽、觀看期限、影片庫）

**P3 產品化（完成）**：點數帳本（保留再結算、失敗釋放）、AI Provider 抽象層（mock／OpenAI、平台金鑰或 BYOK）、程序內任務佇列（可換 BullMQ）、`/studio` AI 創作工作站、`/admin/studio` 模板管理與點數調整、MCP／AI API 的 `adjust_credits`。

## 目錄

```
apps/web          Next.js 15 App Router：(marketing)(shop)(learn)(studio)(account)(admin) 六個路由分組
apps/api          NestJS 11：auth / settings / content / migration / catalog / orders / payments / invoice / learn / ops / admin-ai / admin / health
packages/shared   共用型別、品牌設定、功能旗標、設定鍵名、Ops 動作清單（OPS_ACTIONS 單一真相源）
mcp/              MCP stdio server（訂閱制工具接入點）
scripts/          dev-db.mjs（免 Docker 的本機 PostgreSQL）
docs/             架構說明、全新網站規劃（藍圖）
```

## 本機啟動（免 Docker）

```bash
npm install
npm run dev:db                  # 視窗 1：起本機 PostgreSQL（首次會初始化，資料在 %LOCALAPPDATA%/sitekit）
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
npm run db:setup                # 產生 client、套用遷移、種子（管理員 admin@example.com / admin12345、示範課程 /course/demo-course）
npm run dev:api                 # 視窗 2：http://localhost:4000/api/health
npm run dev:web                 # 視窗 3：http://localhost:3000
```

本機種子把 `payment.provider` 設為 `mock`：購買時進入 `/pay/mock` 假閘道，按「模擬付款成功」即走完整回呼→授權流程。
正式環境改由後台或 MCP 的 `update_settings` 寫入 `payment.provider=newebpay` 與藍新商店參數（見 `apps/api/.env.example`）。

> 注意：dev server 跑著時不要執行建置（`build:web` 打壞 `.next`、`build:api` 清掉 dist 讓 watch 程序死掉）；要建置先停 dev server。

## 建置與 CI

```bash
npm run build                   # shared → api → web
npm run ci                      # build + prisma validate（與 .github/workflows/ci.yml 同步）
```

## 接 MCP（Claude Desktop / Claude Code）

```json
{
  "mcpServers": {
    "sitekit": {
      "command": "node",
      "args": ["<repo>/mcp/server.mjs"],
      "env": { "SITEKIT_API_URL": "http://localhost:4000", "SITEKIT_OPS_TOKEN": "<與 apps/api/.env 的 OPS_TOKEN 相同>" }
    }
  }
}
```

## 部署（Zeabur 或任何容器平台）

四個服務：`web`、`api`、`postgres`、`redis`。`web` 與 `api` 各用 repo 根目錄的 `Dockerfile.web` / `Dockerfile.api` 建置；
`api` 啟動時自動 `prisma migrate deploy`。環境變數見 `apps/api/.env.example` 與 `apps/web/.env.example`，機密只放平台 Secret。
主網域指向 `web`，`web` 以 `API_INTERNAL_URL` 把 `/api/*` 反向代理到 `api`；藍新的 NotifyURL／ReturnURL 都是 `<site.url>/api/payments/newebpay/*`，必須是公開可達的 HTTPS。

詳細架構與分期見 `docs/架構.md` 與 `docs/全新網站規劃.md`。

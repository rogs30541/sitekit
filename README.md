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

## 網站架構樹／選單與全中文介面（2026-09-21，v0.5.1）

- **網站架構樹＝前台導覽**：後台「網站架構」把頁面／文章、系統路徑、外部連結拖進兩層樹（拖曳排序、拖到項目右側成子選單），可設顯示／新分頁；整棵存 `menu_items`，公開 `GET /api/content/menu` 只回可見且已發布的節點並解析 href（slug=home 的頁面→`/`）；樹為空時前台用預設導覽。MCP `get_menu`／`set_menu`。
- **全中文顯示**：訂單／退款／物流／角色／付款方式／點數／內容來源／問答狀態等標籤集中在 `packages/shared`（`ORDER_STATUS_LABELS` 等），後台稽核與 AI 面板顯示中文說明。

## P6 會員與課程社群（2026-09-21，v0.5.0）

- **後台管理員 Email 驗證註冊**：`/admin/login` 的「註冊管理員」→ 寄 6 碼驗證碼（15 分鐘、5 次上限）→ 驗證碼＋密碼建立帳號並登入。資格：admin_users 為空（第一位＝superadmin）或 email／@網域在 `admin.registerAllowlist`（後台「管理員」頁或 MCP update_settings 設定）；不符資格不寄信、回應相同（防列舉）。無驗證的 bootstrap 端點已移除。
- **忘記密碼／重設**（一次性 token、1 小時、重設後清所有 session）、**會員資料**（顯示名稱、變更密碼；第三方登入帳號可直接設密碼）。
- **第三方登入**：Google／LINE Login（OAuth 2.0 授權碼；設定 `google.clientId/clientSecret`、`line.loginChannelId/loginChannelSecret`；Redirect URI＝`<site.url>/api/auth/oauth/<provider>/callback`）。同一人不同管道登入合併：identities 命中 → 該會員；否則以 email 併入既有會員；否則建新會員。`mock` provider 只在非 production 開放供 E2E。登入／註冊頁只顯示已設定的供應商。
- **課程問答與公告**：教室頁下方問答（購買者可提問、可標記章節；公開／僅自己可見）與公告；後台課程頁回覆（Email 通知提問者）、隱藏、公告 CRUD；新提問推 LINE／Email 給管理員；MCP `list_questions`／`answer_question`／`post_announcement`。

## P5 營運化＋後台分離（2026-09-21，v0.4.0）

- **後台帳號與前台會員分離**：管理員存 `admin_users`（獨立 cookie `sk_admin`、SameSite=Strict、12 小時），前台會員 `users` 一律 role=user；後台獨立登入頁 `/admin/login`（前台導覽不顯示、不索引），`admin_users` 為空時登入頁自動變成「建立第一位超級管理員」；之後由 `/admin/accounts` 或 MCP `create_admin`／`update_admin`／`delete_admin` 管理。遷移會把既有 admin/superadmin 會員複製成管理員並把會員角色降為 user。
- **內容編輯器**：`/admin/content` 官網頁面（type=page → `/p/<slug>`；slug=home 取代首頁）與文章（type=post → `/blog/<slug>`）所見即所得編輯（標題／清單／引言／連結／圖片上傳／HTML 原始碼）、草稿／發布／下架、SEO 摘要與封面；API `/api/admin/content`、上傳 `/api/admin/content/upload`（走物件儲存）；MCP `upsert_content`／`list_content`。
- **物件儲存**：`storage.driver=local|s3`（Cloudflare R2／S3 相容，SigV4 免 SDK）；AI 生成結果、編輯器上傳、搬運器媒體落地都走 StorageService。本機磁碟在 Zeabur 重新部署後不保留，正式環境請設 R2。
- **通知中心**：Email（`notify.emailProvider=log|resend`）＋ LINE Messaging API 推播管理員；事件＝註冊歡迎、付款成功（買家＋管理員）、ATM 取號、出貨／送達、退款完成；MCP／後台 `send_test_notification`、`storage_status`；設定頁 `/admin/integrations`。
- **搬運器媒體落地**：`import_content` 加 `landMedia=true` 會把內文 `<img>` 與封面下載到本站儲存並改寫網址（同網址只下載一次、失敗保留原網址）。
- zod 驗證錯誤統一回 400（全域 filter）。

## P4 規模化（2026-09-21）

- **實體電商**：`products.stock`（null＝不追蹤）下單即扣、取消／失敗／退款回補、交易鎖不超賣；折扣碼 `coupons`（percent／fixed、低消、次數、期限）；運費規則 `shipping.fee`／`shipping.freeOver`；訂單含 subtotal／discount／shippingFee／收件資料／物流狀態（pending→shipped→delivered、returned）；逾期未付自動取消（`order.expireHours`，每小時掃）。前台 `/store` 商城＋`/cart` 購物車（localStorage，金額一律由 `POST /api/orders/quote` 試算）。
- **進階報表**：`GET /api/admin/reports/sales`（營收、淨營收、客單價、退款、折扣、運費、依日／月、商品銷量、金流分布，以付款時間計）＋`GET /api/admin/orders/export.csv` 對帳檔（UTF-8 BOM）；後台 `/admin/reports`。
- **搬運器擴充**：`import_products` 商品 CSV（簡式欄位或 Shopify 商品匯出檔、多規格拆件、以 sku 冪等）。
- **效能與資安**：程序內限流（登入 20 次／10 分、MCP 120 次／分、其餘 600 次／分；金流回呼與健康檢查不限；`RATE_LIMIT=off` 供本機 E2E）、`trust proxy`、JSON 上限 5MB、`/api/health` 含 DB ping 與 uptime、orders 新增索引。
- **雙軌接口**：新增 OPS 動作 `sales_report`／`update_shipping`／`manage_coupon`／`adjust_stock`／`expire_orders`／`import_products`（MCP 工具同名 `sitekit_*`，後台 AI 面板同 action）；後台頁 `/admin/products`、`/admin/coupons`、`/admin/reports`、訂單頁物流操作。

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
正式環境改由後台「金流設定」（/admin/payments，走 AI API 路徑）或 MCP 的 `update_settings` 寫入商店參數（見 `apps/api/.env.example`）。

### 金流接口（多家並存）

| 供應商 | 設定鍵 | 結帳方式 | 伺服器驗證 | 退款 API |
|---|---|---|---|---|
| 藍新 NewebPay MPG | `newebpay.merchantId/hashKey/hashIv/testMode` | 表單 POST | TradeSha＋AES 解密＋CheckCode | Cancel→Close |
| 統一金流 PAYUNi UPP | `payuni.merchantId/hashKey/hashIv/testMode` | 表單 POST | HashInfo＋AES-256-GCM | cancel→close |
| 綠界 ECPay AIO | `ecpay.merchantId/hashKey/hashIv/testMode` | 表單 POST | CheckMacValue | DoAction N→R |
| LINE Pay v3 | `linepay.channelId/channelSecret/testMode` | 導向 paymentUrl | Confirm API | refund |
| 支付連 PChomePay v2 | `pchomepay.appId/appSecret/testMode` | 導向 payment_url | 回查 /v2/payment | /v2/refund |

- `payment.methods`＝逗號清單（第一個為預設），結帳頁 `GET /api/payments/methods` 只列「已設定完成」者；`<provider>.testMode` 預設 true（沙箱），上正式才改 `false`。
- 回呼網址一律 `<site.url>/api/payments/<provider>/notify`（伺服器對伺服器）與 `/return`（前景導回，POST 或 GET）；各家商店後台要允許這兩個網址。
- 藍新已用測試商店實測（表單→ccore 支付頁、模擬回呼→授權）；其餘四家依各家公開文件實作、adapter 自測通過（簽章／加解密／回呼解讀），**尚待各家沙箱帳號實測**，支付連的回查欄位名稱以實測為準。

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
主網域指向 `web`，`web` 以 `API_INTERNAL_URL` 把 `/api/*` 反向代理到 `api`；**注意 Next.js rewrites 在建置時定案**，所以 `API_INTERNAL_URL`（與 `NEXT_PUBLIC_*`）要以建置參數餵進 `Dockerfile.web`（已宣告 `ARG`，Zeabur 會把服務環境變數當 build arg 傳入；預設 `http://api.zeabur.internal:8080`）。
藍新的 NotifyURL／ReturnURL 都是 `<site.url>/api/payments/newebpay/*`，必須是公開可達的 HTTPS。

詳細架構與分期見 `docs/架構.md` 與 `docs/全新網站規劃.md`。

### Zeabur 實際部署（2026-09-21 上線）

- 專案 `aigc-sitekit`，專用伺服器 Tencent Tokyo 2C/4GB（ZeaburOS）；服務 `postgresql`（postgres:18）、`redis`、`api`、`web`。
- `api` / `web` 來源都是 GitHub `rogs30541/sitekit`，Dockerfile 貼在服務「設定 → Dockerfile」（內容與 repo 根目錄 `Dockerfile.api` / `Dockerfile.web` 同步；改 Dockerfile 記得兩邊都更新），容器埠 8080。
- `api` 環境變數：`DATABASE_URL=${POSTGRES_CONNECTION_STRING}`、`REDIS_URL=${REDIS_CONNECTION_STRING}`、`APP_ENV=production`、`PORT=8080`、`FRONTEND_URL`、`SESSION_SECRET`、`OPS_TOKEN`。
- `web` 環境變數：`API_INTERNAL_URL=http://api.zeabur.internal:8080`、`NEXT_PUBLIC_SITE_URL=https://aigc-sitekit.zeabur.app`、`NEXT_PUBLIC_APP_ENV=production`。
- 網域 `https://aigc-sitekit.zeabur.app` 綁 `web:8080`；上線後用 MCP 路徑 `update_settings` 寫入 `site.url`，之後再補 `payment.provider=newebpay` 與藍新商店參數。
- 儀表板陷阱：建立服務對話框裡填的環境變數不會保存，要到服務的「環境變數 → 編輯原始環境變數」再填並重新部署；第一位註冊的帳號會成為 superadmin，上線後請先用正式帳號註冊。

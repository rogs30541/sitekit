# CHANGELOG

## v0.34.0（2026-09-26）

- 滑動追蹤（每個區塊都能裝）：設計器任何節點可設 `track{event,percent,once,label}`（渲染成 data-sk-track 屬性），首頁／區塊頁的 20 種區塊可設 `track`／`trackPercent`，25 套一頁式模板每一段預掛 `sp_<區塊>`（可視 50% 送一次）；全站一個 `ScrollTracker`（IntersectionObserver＋MutationObserver）在區塊可視達百分比時送自訂事件
- 頁面滑動深度：TrackingConfig 新增 `scroll{enabled,percents,event}`（預設 25/50/75/100、scroll_depth；網站設定與頁面／銷售頁可覆蓋）；事件 JS 新增「滑動事件」（變數 event／percent／block／page）；`skTrackCustom` 同時送 GA4 gtag event、Meta trackCustom、TikTok track、dataLayer
- 後台：追蹤設定表單「滑動追蹤」區、設計器屬性面板「滑動追蹤」、首頁區塊編輯器事件名／可視百分比；OPS `set_tracking`／`upsert_content`／`set_home_sections` 說明更新
- e2e p36

## v0.33.0（2026-09-25）

- 一頁式網頁套版（25 套）：分析 airuru.com.tw 課程銷售頁結構（主張→信任帶→痛點→權威→承諾→公式→模組×N→優惠→見證→場次→頁尾；只取骨架）存成課程類「霓虹爆款」，並反推電商／形象／品牌／專業服務四類敘事，每類 5 種風格配色（`packages/shared/src/sales-templates/`：DesignDoc 內文＋主題色＋區塊順序／標題＋通知列＋顯示設定；文案圖片佔位、圖示名稱）
- core `SalesTemplateService`（list／apply：建立或覆寫銷售頁草稿，不發佈、不動掛商品／表單／追蹤）；OPS `list_sales_templates`／`apply_sales_template`；MCP 同名；後台「一頁式網頁 → 從套版建立」（分類頁籤、線框縮圖、配色點）；指令台 B3 範例／TOOL_HINTS／mock「用模板 <id> 建立銷售頁「標題」」
- 設計器渲染：iconbox／list 的 icon 若為圖示名稱（ICON_NAMES）輸出線條 SVG（不再只有 emoji）
- e2e p35

## v0.32.0（2026-09-25）

- Cloudflare 前台殼：`apps/web` 以 OpenNext（@opennextjs/cloudflare 1.20）打包成 Worker `sitekit-web`（`wrangler.jsonc`、`open-next.config.ts`、`cf:build`／`cf:preview`／`cf:deploy`）；next.config 在 OPEN_NEXT_CLOUDFLARE 下不設 standalone；api Worker 的 FRONTEND_URL 指向前台 Worker
- 前台→api 改走 **Service Binding**（同帳號 workers.dev 之間 fetch 會掛住）：`lib/api-fetch.ts` 統一入口（Workers 上讀 OpenNext 放在 globalThis 的 env.API，Node 走一般 fetch），所有伺服器端 API 呼叫（apiPublic／apiServer／middleware／預覽頁／銷售頁／revalidate）改用；瀏覽器 `/api/*` 在 Workers 由 `app/api/[...path]/route.ts` 代理（轉發 cookie／Set-Cookie），Node 仍由 next.config **beforeFiles** rewrite 先攔；apiPublic 加 10 秒逾時（建置期與 api 冷啟動不再掛住整個 build）
- 實測：https://sitekit-web.sitekit-deploy-cloudflare.workers.dev SSR 與 `/api/*` 代理正常；免費方案 api 冷啟動 5–8 秒（文件註明建議 Workers Paid 或 Zeabur）；建置期 API 網址不可含埠（OpenNext 路徑比對）；Windows 中文路徑需改 ASCII 路徑或 CI 建置
- CI 新增 `build-web-cf`（Linux OpenNext 建置驗證，不部署）

## v0.31.0（2026-09-25）

- 一鍵建站：OPS／MCP `recommend_site_template`（行業關鍵字→分類、tags／風格計分、回推薦與備選）與 `quick_setup_site`（confirm；挑版型→套用→品牌名／標語／Email／電話寫進首頁 hero 與聯絡區塊→品牌設定→主題；不產圖不杜撰）；後台套版庫與安裝精靈的「一鍵建站」面板（`components/QuickSetupPanel.tsx`）；指令台「幫我建站」流程（SYSTEM_PROMPT 第 11 條＋mock 規則）
- 指令台待確認卡片：`set_home_sections` 顯示區塊 kind 差異（＋／－、數量），套版類提示覆寫範圍與還原
- README「最快開站」改以 Zeabur 為首；安裝精靈標示建議平台
- e2e p34（推薦分類判斷、quick_setup_site 寫入品牌資料與區塊、confirm 保護、mock 一鍵建站待確認→確認執行、還原）

## v0.30.0（2026-09-25）

- AI 工作站操作規劃重寫（`docs/AI工作站操作規劃.md`）：依前後台整合現況把指令台改為五組十二項工作（建站：版型與主題／選單；內容：首頁區塊／頁面與文章／銷售頁；商務：商品庫存／課程學員／訂單物流發票；營運：報表名單／客服訊息／追蹤 SEO；設計：製圖與 Banner），每項附常用動作與範例；三鐵律（單一真相源、讀立即寫待確認、草稿優先發佈手動）與一回合標準流程
- 補齊前後台對應的兩個 OPS／MCP 動作：`set_theme`（theme.* 白名單，accent 同步主色）、`update_brand`（brand.*／seo.*／site.locale 白名單，拒絕金流／金鑰）——指令台不再需要被排除的 update_settings 才能改主題與品牌
- 指令台 SYSTEM_PROMPT／TOOL_HINTS 重寫：套版影響與還原、整份覆寫規則、區塊頁優先（design.kind='sections'）、20 種區塊欄位速查、圖示名稱不用 emoji、產圖回填區塊、表單訊息只擬稿不寄信
- 指令台 UI：左欄分組工作項目＋「站台狀態」卡（目前版型／深淺色／未讀表單訊息／未回覆提問）；mock 規則加版型／主題／品牌／首頁區塊／表單訊息
- e2e p33（設定五組十二項、set_theme／update_brand 白名單與生效、mock 套版→待確認→確認執行、主題／品牌／首頁區塊／表單訊息規則、系統功能拒絕）

## v0.29.0（2026-09-25）

- 套版與後台深度整合（前台每個區塊功能都有後台對應）：
  - **區塊頁進內容管線**：套版子頁（design.kind='sections'）在「新增網頁」以「區塊編輯器」編輯（PageStudio 第三模式）、自動存草稿、沙盒預覽回 sections、發佈走同一套版本備份；DesignService 認得 SectionsDoc（parseSectionsDoc 驗證、後備 HTML＝sectionsFallbackHtml）——先前開啟套版子頁會被當成 HTML、存檔即丟區塊
  - **區塊編輯器重做**（`components/admin/SectionsEditor.tsx`，首頁版面與區塊頁共用）：清單欄位逐列表單（不再 JSON）、圖片欄可上傳、圖示名稱挑選＋預覽、錨點 id、版式／底色中文選項、複製區塊、進階 JSON
  - **外觀主題後台**（網站設定 → 外觀主題）：深淺色／字型／圓角／頁首／頁尾／內容寬度／標題粗細／第二主色，走 update_settings theme.*；主色仍在「網站設定 → 主色」
  - **聯絡表單真的會收**：contact 區塊「顯示聯絡表單」→ 前台 ContactForm → `POST /api/content/contact`（zod、蜜罐、同 email 60 秒一筆）→ `contact_messages` 表（PG／SQLite／MySQL／D1 遷移）→ 站主 Email 通知（mail.adminTo）→ 事件 contact.submitted（外掛可接）→ 後台「網站 → 表單訊息」（狀態／備註／Email 回覆／刪除）；OPS `list_contact_messages`／`update_contact_message`／`delete_contact_message`＋MCP 同名三工具
- 圖示改線條 SVG（`packages/shared/site-templates/icons.ts` 79 顆；`components/Icon.tsx`）：50 套版型 173 處 emoji 全部換成圖示名稱，舊資料／使用者貼的 emoji 自動對映，對不到才原樣顯示；渲染器的 ✓／＋／↗／✦ 也改 SVG
- 版型資料自檢：連結審核（/p/<slug> 必附子頁、錨點必有 id、無空連結）——修 14 處；`withGenericPages` 自動補 about／contact／faq 通用頁，保證套用後沒有死連結
- e2e p32（聯絡表單全流程、區塊頁草稿→預覽→發佈不丟 sections、主題設定反映到前台、無 emoji）

## v0.28.0（2026-09-25）

- 快速套版：五大分類（形象／電商／課程／品牌／專業服務）× 10 ＝ 50 套版型（`packages/shared/src/site-templates`；結構取自指定三站＋Wix 分類法＋15 參考站，只取版面骨架），每套＝主題（theme.*）＋主選單／頁尾＋首頁區塊＋子頁區塊（about／services／contact／faq…）
- 區塊 schema 擴為 20 種 kind（hero／banner／stats／features／split／gallery／testimonials／faq／pricing／steps／team／logos／video／cta／contact／categories／courses／products／posts／html，各有 variant＋tone／背景圖／緊湊），首頁區塊與「區塊頁」（Content.design.kind='sections'）共用；`PUT /api/admin/site/home` 同一 schema
- core `SiteTemplateService`：apply（confirm 必填；備份只在第一次套版前建立、restore 一律回到套版前）／restore／list／current；OPS `list_site_templates`／`apply_site_template`；MCP `sitekit_list_site_templates`／`sitekit_apply_site_template`
- 前台：`SectionRenderer` 取代 HomeSections（全部 kind／variant、滿版色帶、深色／圖片底）；root layout 把 theme 轉 CSS 變數（--accent／--on-accent／--font／--radius／--container、data-theme 深色）；SiteNav 5 種頁首、SiteFooter 3 種頁尾；`/p/[slug]` 渲染區塊頁；`GET /api/content/site` 帶 theme
- 後台：「網站 → 套版庫」（分類頁籤、線框縮圖、套用／還原）、首頁版面編輯器改 20 種 kind（文字欄逐欄、清單欄 JSON）；安裝精靈新增「版型」步驟（站名之後，可略過）
- e2e p31（50 套、confirm 保護、套用後 settings／選單／子頁／首頁 HTML、冪等、restore、MCP 名單）

## v0.27.0（2026-09-24）

- Cloudflare Workers＋D1 殼（apps/worker，M3 路線 B）：Hono＋nest-bridge 掛既有 187 條 Nest 路由、迷你 DI 容器、D1 driver adapter；本機 D1 14 檔 API e2e 全綠、正式 D1 部署上線
- Dockerfile.monolith 移除 VOLUME（匿名暫存卷害持久硬碟偵測誤判）；README／docs：Render 免費層實測上線
- deploy/render-free.yaml：Render 免費方案 Blueprint（free web＋free Postgres）；render.yaml FRONTEND_URL 改建立時填值
- deploy/cloudflare：image 改指公開 GHCR 映像、instance_type standard-1、containers SDK 版本；docs §12 平台實測關卡與 repo 公開完成

## v0.26.0（2026-09-24）

- db：MySQL 模式把 PostgreSQL client 的 JsonNull/DbNull/AnyNull 哨兵換成 MySQL client 自己的（否則存成 {}，hasDesign 誤判）
- db：MySQL 讀回 JSON null 統一成 JS null（hasDesign 誤判 true）；p10 失敗附 api 首頁區塊與 html 尾段
- e2e p10/p13 失敗附細節、CI mysql 失敗時傾印 site 與首頁；README 去 ACME_EMAIL
- compose：Caddyfile 去掉需 email 的全域區塊（空值害 Caddy 起不來）；e2e p10/p13 失敗附細節、CI mysql 失敗時傾印 site 與首頁
- deploy/cloudflare：Containers 路線設定檔與說明；docs §12 各平台實測狀態與阻礙
- MySQL 支援（第三種資料庫）＋部署設定檔：deploy/compose（Caddy 自動 HTTPS＋單體＋Postgres，CI compose-smoke 實測）、railway.json／render.yaml／fly.toml、README 各平台一頁步驟；e2e 藍新測試金鑰改假值

## v0.25.1（2026-09-24）

- 字樣改「伺服器硬碟」並附實際路徑（精靈／後台／共用標籤／i18n／文件）
- 儲存步驟改「用部署平台的硬碟」：本機磁碟持久性偵測（Linux st_dev 比對＝掛了 volume）、精靈／後台依偵測給文案與警告不硬擋、機密欄位防瀏覽器帳密自動填入、CLI env 只遮 DATABASE_URL 密碼、README／架構文件記 Zeabur 單體重佈實測步驟

## v0.25.0（2026-09-23）

- 前台 i18n（1.3）：gettext 風格 t('原文')＋字典（packages/shared/src/i18n、en 235 條）、site.locale 全站語言設定（網站設定下拉）、root layout setLocale＋I18nProvider＋html lang；前台 38 頁 9 元件字串抽離；scripts/i18n-keys.mjs 列未翻 key；e2e p30

## v0.24.0（2026-09-23）

- 完整匯出／備份／還原：ExportService（DMMF 通用整庫 JSON、拓撲排序匯入、SQLite↔PostgreSQL 搬家）、備份目錄＋每日自動備份＋保留份數、superadmin 端點（export／import／backups）、OPS export_site／import_site／list_backups、CLI export／import、後台「備份與還原」面板；e2e p29

## v0.23.0（2026-09-23）

- 外掛機制（1.1）：core 事件匯流排＋外掛註冊表（事件／OPS 動作／設定欄位）、api 建置期載入（sitekit.config.mjs／SITEKIT_PLUGINS）、後台「外掛」頁、MCP 動態外掛工具；第一個官方外掛 @sitekit/plugin-webhook（簽章 JSON 推送、事件篩選、webhook_test）；e2e p28

## v0.22.0（2026-09-23）

- fix(release): 中文路徑用 fileURLToPath 解析 root
- 發行管線：release.yml（tag → GHCR 單體映像＋免建置發行包＋GitHub Release）、scripts/release.mjs（升版／CHANGELOG／tag／push）、CHANGELOG.md、deploy/zeabur-template.yaml、後台版本更新檢查（GET /api/admin/system/update-check＋頂部提示）

## v0.21.0（2026-09-23）

- 單體殼 apps/server：一個 Node 程序、一個埠，api＋前台同程序，預設 SQLite；`sitekit start` 即開站；Dockerfile.monolith；CI 加 e2e-monolith

## v0.20.0（2026-09-23）

- 一份模型兩種資料庫：packages/db 由 PostgreSQL schema 自動產生 SQLite schema／migration，createPrisma() 依 DATABASE_URL 選 client；同一套 e2e 在兩種資料庫全綠

## v0.19.0（2026-09-23）

- 交付化地基：安裝精靈 /setup、SESSION_SECRET／OPS_TOKEN 自動產生、去示範資料與去品牌化（SEED_DEMO=1 才建示範）、健康檢查與支援包、OPS token 輪替

## v0.18.0（2026-09-23）

- M1 抽 core：業務核心搬到 packages/core（零 NestJS 依賴），apps/api 只剩薄殼

## v0.17.1（2026-09-23）

- 發佈即清快取（api → web on-demand ISR revalidation）；CI 全綠修正

## v0.17.0（2026-09-23）

- M0 測試護欄：20 支 e2e 進 repo＋CI 起 postgres 跑全套；修 hasTracking 空設定 500、綠界物流通知撈舊單


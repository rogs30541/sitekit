# CHANGELOG

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


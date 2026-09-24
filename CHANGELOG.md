# CHANGELOG

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


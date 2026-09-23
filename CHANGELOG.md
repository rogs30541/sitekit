# CHANGELOG

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


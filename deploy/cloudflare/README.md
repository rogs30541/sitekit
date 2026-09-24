# Cloudflare 部署

## 路線 A（可用，未實測）：Cloudflare Containers 跑同一個單體映像

1. `wrangler login`（需 Workers Paid；Containers 為付費方案功能）
2. 資料庫：Containers 沒有持久硬碟，用外部 PostgreSQL（Neon／Supabase 免費層即可）  
   `wrangler secret put DATABASE_URL`
3. 上傳檔：建 R2 bucket（`wrangler r2 bucket create sitekit-uploads`），開站後精靈第 3 步選「Cloudflare R2／S3 相容」填 endpoint／金鑰／公開網址
4. `cd deploy/cloudflare && npm install && npx wrangler deploy` → 開 `https://sitekit.<子網域>.workers.dev/setup`
5. 自訂網域：Workers → Settings → Domains；把 `FRONTEND_URL` secret 設成該網址（或後台網站設定填 site.url）

未實測原因：本機 wrangler 未登入、Containers 需付費方案。設定檔依 Cloudflare Containers 文件（2025-09）撰寫。

## 路線 B（路線圖 M3，未開工）：Workers＋D1 無伺服器殼

需要：Hono 殼把 apps/api 的 25 個 controller／187 條路由改寫成 Hono 路由（守衛：session cookie、admin、OPS token）、`packages/core` 改用 Prisma D1 driver adapter（`@prisma/adapter-d1`，SQLite 版 schema 已就緒）、前台改走 `@opennextjs/cloudflare`、儲存強制 R2、排程改 Cron Triggers、`node:fs` 相關（本機儲存、備份）在 Workers 關閉。估 5–8 個工作天。舊的 `apps/edge`（Hono＋Drizzle 對照原型）與 core 無關，之後會移除。

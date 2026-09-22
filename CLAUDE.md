# AIGC創客架站套件（代號 SiteKit）專案規則

## 底層規則
1. **瀏覽器操作一律使用 Claude in Chrome**（使用者真實 Chrome，含登入狀態）：Zeabur／Cloudflare／藍新／WordPress 等後台皆走此路徑；內建瀏覽器面板只用於本機 dev server 預覽。**使用者貼出網址＝用 Claude in Chrome 打開該網址查看**（不用 WebFetch／curl／內建面板代替）。
2. **後台雙路徑**：MCP 路徑 `/api/ops/*` 只認 Bearer `OPS_TOKEN`（給訂閱制 AI 工具做部署／更新）；AI API 路徑（後台管理員 cookie `sk_admin`，帳號存 admin_users、與前台會員 users 分離） `/api/admin/ai/*` 只認後台 cookie session（管理員）；兩者收斂到 `OpsService`，新增維運功能先登記 `packages/shared` 的 `OPS_ACTIONS`。AI 只操作既有功能，不為 AI 另寫邏輯。
3. **金流鐵律**：授權只在 `OrdersService.markPaid` 寫入；付款以伺服器回呼驗章為準；回呼冪等；媒體網址即時簽發帶時效。
4. **公開 API 不回成本／毛利／systemPrompt／影片 ID**。
5. **每次功能更新後 commit＋push**（repo `rogs30541/sitekit`，程式代號維持 sitekit）。

## 開發鐵律
- api 開發／建置一律 `nest start --watch`／`nest build`，禁用 tsx。
- dev server 跑著時不可跑 `build:api`／`build:web`（清 dist／打壞 .next），先停預覽再建置。
- 新增遷移：`prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<ts>_<name>/migration.sql`，再 `migrate deploy`。
- 本機 DB：`npm run dev:db`（免 Docker）；種子 `npm run db:setup`。
- zod 解析泛型用 `<S extends z.ZodTypeAny>(schema: S) => z.infer<S>`。
- 日期一律用 `fmtDateTime`／`fmtDate`（固定台北時區），避免 hydration 不一致。

詳細架構見 `docs/架構.md`，藍圖見 `docs/全新網站規劃.md`。

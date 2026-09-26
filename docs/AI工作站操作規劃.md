# AI 工作站操作規劃（v0.30.0，2026-09-25 重寫）

> 依 v0.28–v0.29 的前後台整合（套版、20 種區塊、主題、區塊頁、聯絡表單、表單訊息）重寫。
> AI 工作站＝後台「全站工作總控」：管理員用自然語言（或 MCP 用工具）操作整站；**AI 只操作既有功能，不為 AI 另開邏輯**（同 [[ai-assist-principle]]）。

## 1. 定位與三條鐵律

| 鐵律 | 說明 |
|---|---|
| **單一真相源** | 每個工作都對應 `OPS_ACTIONS`（`packages/shared/src/index.ts`）裡的一個動作；指令台、MCP、後台按鈕、外掛動作走同一個 `OpsService.run`，同一套稽核。指令台不會做出後台做不到的事，後台能做的事指令台也要做得到（本次補 `set_theme`／`update_brand` 就是為了補齊）。 |
| **讀立即、寫待確認** | 唯讀動作（R）AI 自己跑；寫入動作（W）一律列成待確認清單，管理員按「確認執行」（HMAC token、30 分鐘、限本人）才落地。同一回合可排多個寫入。 |
| **草稿優先、發佈手動** | 頁面／區塊頁／銷售頁一律「存草稿 → 給沙盒預覽連結 → 使用者說要上線才 publish（confirm）」。套版（apply_site_template）與首頁區塊（set_home_sections）是即時生效的寫入，因此仍走待確認，且回覆必須說明會覆寫什麼、可用 restore 還原。 |

不開放（`COMMAND_EXCLUDED_ACTIONS`）：部署、遷移、系統設定（含金鑰／金流）、管理員帳號、點數沖正、備份匯入匯出、測試通知。這些只在「系統功能」選單人工操作。

## 2. 工作項目（由七大改為五組十二項）

指令台左欄依「建站 → 內容 → 商務 → 營運 → 設計」五組排列；每項＝一句定位＋常用動作＋範例指令（範例會填進輸入框）。

### A. 建站
| 項目 | 常用動作 | 典型流程 |
|---|---|---|
| **A1 版型與主題** `site` | `recommend_site_template`（R）→ `quick_setup_site`（W，confirm，一鍵建站）；`list_site_templates`（R）→ `apply_site_template`（W，confirm）；`get_site`（R）→ `set_theme`（W）；`update_brand`（W） | 「幫我挑一套適合烘焙坊的電商版型並套用」→ AI 先列 shop 分類、比較風格、選一套排入待確認，回覆說明會覆寫首頁／選單／子頁與可還原。「整站換成深色＋圓體字」→ `set_theme({mode:'dark',font:'rounded'})`。「網站名稱改成…、Email 改成…」→ `update_brand`。 |
| **A2 選單與導覽** `menu` | `get_menu`（R）→ `set_menu`（W） | 「主選單加一個『作品集』連到 /p/works，放在『關於』前面」→ 先讀整棵樹再整棵覆寫（不可只送差異）。 |

### B. 內容
| 項目 | 常用動作 | 典型流程 |
|---|---|---|
| **B1 首頁區塊** `home` | `get_site`（R）→ `set_home_sections`（W） | 「首頁加一段學員見證（三則）放在課程列表後面」→ 讀現有 sections、插入 `testimonials` 區塊、整組回寫。20 種 kind 與欄位見 §4。 |
| **B2 頁面與文章** `page` | `list_content`／`get_content_draft`（R）→ `upsert_content`（W，草稿）→ `preview_content`（R）→ `publish_content`（W，confirm）；`list_revisions`／`restore_revision` | 新頁面優先用**區塊頁**：`design: { kind:'sections', sections:[…] }`（與首頁同一套 20 種區塊，後台可用區塊編輯器續改）；只有需要自由排版才用視覺設計器 DesignDoc。文章（type post）用 body HTML。 |
| **B3 一頁式銷售頁** `sales` | `list_sales_templates`（R）→ `apply_sales_template`（W，confirm，25 套模板建草稿）；`list_sales_pages`／`get_sales_page`（R）→ `upsert_sales_page`（W）→ `preview_sales_page`（R）→ `publish_sales_page`（W，confirm） | 「做秋季組合銷售頁，掛 SKU A 當優惠、B 當加購」→ 先 `list_products` 查 productId。 |

### C. 商務
| 項目 | 常用動作 | 典型流程 |
|---|---|---|
| **C1 商品與庫存** `product` | `list_products`（R）→ `upsert_product`／`set_product_variants`／`adjust_stock`／`delete_product`（W）；`import_products`（W，dryRun 先跑） | 「把分類『服飾』全部下架」→ 先列再逐筆排入待確認。 |
| **C2 課程與學員** `course` | `list_courses`（R）→ `upsert_course`／`add_chapter`／`post_announcement`（W）；`list_questions`（R）→ `answer_question`（W） | 「建立課程…並加三章」；「回覆所有未回覆的提問，語氣親切」→ 先列 open 提問，逐題擬稿排入待確認（回覆會寄信給學員，務必確認）。 |
| **C3 訂單物流發票** `orders` | `list_orders`／`get_order`（R）→ `update_shipping`／`create_logistics_order`／`issue_invoice`／`invalidate_invoice`（W）；`manage_coupon`（W）；`expire_orders`（W） | 「今天已付款未出貨的訂單全部標記出貨（黑貓）並開發票」→ 先列，再對每筆排入兩個寫入。 |

### D. 營運
| 項目 | 常用動作 | 典型流程 |
|---|---|---|
| **D1 報表與名單** `report` | `sales_report`（R，scope shop/course/all）；`list_orders`（R）；`list_members`（R）→ `delete_member`（W） | 「比較上月與本月營收」→ 兩次 `sales_report` 後摘要；「找出買過課程但沒買商品的會員」→ `list_members({tag:'course'})`。 |
| **D2 客服與訊息** `inbox` | `list_contact_messages`（R）→ `draft_contact_reply`（R，AI 擬稿：只用原訊息＋站主要點，缺事實留【請補充】；不寄信）→ `reply_contact_message`（W，真的寄信）／`update_contact_message`／`delete_contact_message`（W）；`list_mail_templates`／`preview_mail_template`（R）→ `set_mail_template`（W）；`list_questions`（R） | 「未讀的聯絡表單有哪些？幫我依急迫度排序並各擬一句回覆」→ 列 new，摘要；「幫訊息 xxx 擬回覆草稿，要點：下週一回電」→ `draft_contact_reply` 即時回草稿貼給使用者審閱；「回覆訊息 xxx「…」」→ `reply_contact_message` 待確認後寄出；「把 xxx 標成已回覆並註記」→ 寫入待確認。後台「表單訊息」同一套：要點＋AI 擬稿→填回覆框→寄出回覆。 |
| **D3 追蹤與 SEO** `tracking` | `get_tracking`（R）→ `set_tracking`（W，整份回寫；含 scroll 深度百分比事件、openaiPixel ChatGPT Ads）；區塊可視事件在 `set_home_sections`／`upsert_content` 的區塊 `track`；`update_brand`（W：描述／OG 圖／語言） | 「裝 GA4 G-XXXX 和 Meta Pixel」→ 先 `get_tracking` 取現值再整份回傳（未給欄位會被清空）。 |

### E. 設計
| 項目 | 常用動作 | 典型流程 |
|---|---|---|
| **E1 商品製圖與 Banner** `image` | `list_image_templates`（R）→ `generate_image`（W，花錢）→ `upsert_product`（封面）／`set_home_sections`／`upsert_content`（放進 hero／gallery／split 的 imageUrl） | 一次一張、先確認尺寸與用途；商品圖優先套 20 組模板＋參考圖（商品現有 coverUrl）。產完的網址直接寫進區塊的 `imageUrl`／`bgImageUrl`。此工作項目內嵌 inShow 式產圖面板（模板庫／生成記錄／配置）。 |

## 3. 一回合的標準操作流程

```
使用者一句話
 → ① 讀：用 R 動作把現況查清楚（get_site／list_*／get_*）
 → ② 規劃：把要改的事拆成 W 動作（同一回合可多個），回覆先講「要做什麼、影響什麼、怎麼還原」
 → ③ 待確認清單：前端列出每個 W 動作與參數摘要；管理員「確認執行」或「取消」
 → ④ 執行：依序跑，任一失敗即停並回報（不靜默）
 → ⑤ 驗證：頁面類給沙盒預覽連結；站台類提示「前台 60 秒內更新（ISR）」；可還原的說明還原方式
```

回覆規範：繁體中文、條列、精簡；金額整數新台幣；連結完整輸出；找不到就說找不到，不杜撰。

## 4. 區塊（sections）速查——首頁區塊與區塊頁共用

20 種 kind，皆可帶 `variant`、`tone`（default／muted／accent／dark／image＋`bgImageUrl`）、`compact`、`id`（錨點，選單可連 `/#id`）。圖示欄一律填**圖示名稱**（`ICON_NAMES`，例 mail／phone／star／rocket），不用 emoji。

| kind | 重要欄位 |
|---|---|
| hero | variant center/left/split/cover/editorial/dashboard/carousel；kicker/title/subtitle/ctaText/ctaHref/cta2*/imageUrl/videoUrl/imageSide/highlights[{icon,title,text}]/slides[] |
| banner | text/href |
| stats | items[{value,label,note}]；variant row/cards/inline |
| features | items[{icon,code,tag,title,text,href,ctaText}]；columns 1–4；variant grid/list/icons/tabs/numbered |
| split | title/text/bullets[]/imageUrl/videoUrl/imageSide/sticky/cta |
| gallery | items[{imageUrl,caption,href}]；columns 2–6；variant grid/masonry/strip/logos |
| testimonials | items[{quote,name,role,avatarUrl,metric}]；variant cards/quotes/wall/single |
| faq | items[{q,a}] |
| pricing | plans[{name,price,period,note,features[],ctaText,ctaHref,highlight}] |
| steps | items[{title,text}]；variant numbers/timeline/cards |
| team | members[{name,role,bio,avatarUrl}]；variant grid/list/founder |
| logos | items[{name,imageUrl}] |
| video | videoUrl（YouTube／mp4）/text |
| cta | title/text/buttonText/buttonHref；variant band/card/split |
| contact | items[{icon,label,value,href}]；variant cards/columns/map（mapEmbedUrl）；**showForm=true 會顯示聯絡表單→表單訊息** |
| categories | items[{icon,title,href,count,imageUrl}]；variant tiles/chips/icons |
| courses／products／posts | 自動讀既有資料：title/subtitle/limit/columns/variant/ctaText/ctaHref |
| html | html（會消毒） |

## 5. 指令台 UI（後台 `/admin/studio`）

- **左欄**：五組十二項工作項目（點選切換範例）；「站台狀態」卡（目前版型、主題深淺色、未讀表單訊息數、未回覆提問數）——讓 AI 與人都看得到現況。
- **中央**：對話＋結果卡（已查詢／待確認／已執行）；待確認卡顯示動作、參數摘要與「會覆寫／可還原」提示；`set_home_sections` 與 `upsert_content`（區塊頁）顯示區塊 kind 差異（＋／－）、`upsert_content` 標示覆寫既有頁面／新頁面（同回合先 `get_content_draft`／`list_content` 才有現況可比）。
- **對話記錄**（v0.37.0）：每回合自動存進 `admin_ai_conversations`（每位管理員自己的，含結果卡與待確認 token），工具列「對話記錄」切換／刪除、「新對話」；MCP／OPS `list_ai_conversations` 只列摘要（系統類，不開放給指令台）。
- **E1 製圖**：內嵌 inShow 式產圖面板，對話指令收進折疊區。
- **設定**：供應商 anthropic／openai／gemini／mock 與模型自動偵測；金鑰只在這裡填（走 `update_settings`，屬系統功能，不開放給對話）。
- **模板與任務管理**分頁：產圖模板 CRUD、任務列表。

## 6. MCP 對等

系統類（不開放給對話、只走 MCP／後台）補充：`update_admin` 自 v0.38.0 可帶 `email` 換管理員 Email（主管理員 Email `admin.primaryEmail` 與 `mail.adminTo` 跟著改）；管理員救援走環境變數 `SITEKIT_ADMIN_EMAIL`／`SITEKIT_ADMIN_PASSWORD` 或 CLI `sitekit admin`，不經 OPS。

每個工作項目的動作在 `mcp/server.mjs` 都有同名 `sitekit_*` 工具（本次新增 `sitekit_set_theme`、`sitekit_update_brand`）。訂閱制 AI（Claude Desktop／Code）用 MCP 做部署與批次維運；後台指令台給站主日常操作。兩者共用 `OpsService.run` 與稽核。

## 7. 本次落地（v0.30.0）

1. `COMMAND_TASKS` 改五組十二項（含 group），CommandConsole 分組顯示＋站台狀態卡。
2. 新 OPS／MCP：`set_theme`（theme.* 白名單）、`update_brand`（brand.*／seo.*／site.locale 白名單，不含機密）。
3. `SYSTEM_PROMPT` 與 `TOOL_HINTS` 重寫：套版／主題／首頁區塊 20 種／區塊頁（design.kind='sections'）／表單訊息／產圖回填區塊。
4. mock 規則加：套版／主題／首頁區塊／表單訊息／問答，讓 CI 與無金鑰示範也能走完流程。
5. e2e p33：設定回五組十二項、`set_theme`／`update_brand` 白名單與生效、mock 指令台走套版→待確認→執行。

## 8. 下一步（不在本輪）

- （v0.31.0 已做）一鍵建站 `quick_setup_site`：挑版型＋套用＋品牌資料寫進區塊＋品牌設定＋主題；後台套版庫／精靈有同名面板。文案初稿與產圖仍分開做（不杜撰）。
- （v0.31.0 已做）待確認卡片：`set_home_sections` 顯示區塊 kind 差異（＋／－）；套版類提示覆寫範圍與還原。
- （v0.37.0 已做）待確認卡片：`upsert_content` 區塊頁差異＋覆寫／新頁面標示。
- （v0.36.0＋v0.37.0 已做）表單訊息 AI 回覆草稿→審閱→一鍵寄出（`draft_contact_reply`→`reply_contact_message`；後台表單訊息頁同一套）。
- （v0.37.0 已做）對話記錄落庫（`admin_ai_conversations`；sessionStorage 只當快取）。
- 對話記錄搜尋／匯出；跨管理員共享（目前只有本人可見）。

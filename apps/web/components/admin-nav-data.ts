/**
 * 後台大分類選單資料（純資料模組，無 'use client'）。
 * 注意：不能放在 AdminNav.tsx（client module）——server component（/admin 首頁）從 client module import 非元件常數會拿到 client reference，`.map` 直接炸 500（v0.16.5 線上實測 digest 2174542681）。
 */
export interface AdminNavGroup {
  key: string;
  label: string;
  items: { href: string; label: string; desc?: string }[];
}

/** 後台大分類選單：網站／帳務／電商／課程／會員資料庫／AI 工作站／系統功能（點擊展開；目前頁面所在分類高亮） */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    key: 'site',
    label: '網站',
    items: [
      { href: '/admin/site', label: '網站設定', desc: '品牌／SEO／追蹤設定（全站）／首頁區塊' },
      { href: '/admin/site/templates', label: '套版庫', desc: '五大分類 × 10 套快速套版：主題／首頁區塊／選單／子頁一鍵套用' },
      { href: '/admin/menu', label: '網站架構', desc: '主選單／頁尾選單（拖曳）' },
      { href: '/admin/content', label: '新增網頁', desc: '視覺設計器／草稿／沙盒預覽／發佈／版本' },
      { href: '/admin/sales', label: '一頁式網頁', desc: '通知／倒數／內文／產品與課程區塊／表單／順序／追蹤' },
      { href: '/admin/posts', label: '文章', desc: '部落格文章（/blog）' },
      { href: '/admin/messages', label: '表單訊息', desc: '前台「聯絡我們」表單送出的訊息；狀態／備註／Email 回覆' },
    ],
  },
  {
    key: 'finance',
    label: '帳務',
    items: [
      { href: '/admin/payments', label: '金流', desc: '全站共用：藍新／統一／綠界／LINE Pay／支付連' },
      { href: '/admin/shipping', label: '物流', desc: '全站共用：綠界／藍新超商與宅配' },
      { href: '/admin/invoice', label: '發票', desc: '全站共用：ezPay／綠界／光貿電子發票' },
    ],
  },
  {
    key: 'shop',
    label: '電商',
    items: [
      { href: '/admin/products', label: '商品' },
      { href: '/admin/orders', label: '電商訂單' },
      { href: '/admin/coupons', label: '電商折扣碼' },
      { href: '/admin/reports', label: '電商報表' },
    ],
  },
  {
    key: 'learn',
    label: '課程',
    items: [
      { href: '/admin/courses', label: '課程管理' },
      { href: '/admin/course-orders', label: '課程訂單' },
      { href: '/admin/course-coupons', label: '課程折扣碼' },
      { href: '/admin/course-reports', label: '課程報表' },
    ],
  },
  { key: 'members', label: '會員資料庫', items: [{ href: '/admin/members', label: '會員資料庫', desc: '前台會員名單；電商客戶／課程學員自動標籤；可刪減' }] },
  { key: 'ai', label: 'AI 工作站', items: [{ href: '/admin/studio', label: 'AI 工作站', desc: '指令台／產圖／模板與任務管理（前台無工作站）' }] },
  {
    key: 'system',
    label: '系統功能',
    items: [
      { href: '/admin/system', label: '系統設定', desc: '總覽數字／AI API 路徑／維運稽核' },
      { href: '/admin/integrations', label: '儲存與通知' },
      { href: '/admin/plugins', label: '外掛', desc: '已載入的外掛、設定與動作' },
      { href: '/admin/accounts', label: '管理員' },
    ],
  },
];

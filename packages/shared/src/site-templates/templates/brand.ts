/** 品牌類 10 套：個人品牌、工作室、作品集、生活風格 */
import type { SiteTemplate } from '../common';
import { MENU, PAGES } from '../common';

const brandNav = (extra: { label: string; href: string }[] = []) => [{ label: '首頁', href: '/' }, ...extra, { label: '關於', href: '/p/about' }, { label: '聯絡', href: '/p/contact' }];
const works = (title = '作品'): SiteTemplate['pages'][number] => ({ slug: 'works', title, sections: [{ kind: 'hero', variant: 'center', title, compact: true }, { kind: 'gallery', variant: 'masonry', columns: 3, items: [] }, { kind: 'cta', variant: 'band', title: '想一起做點什麼？', buttonText: '聯絡我', buttonHref: '/p/contact' }] });
const aboutMe = (title = '關於'): SiteTemplate['pages'][number] => ({ slug: 'about', title, sections: [{ kind: 'hero', variant: 'center', title, compact: true }, { kind: 'team', variant: 'founder', members: [{ name: '你的名字', role: '身份', bio: '三段以內。' }] }, { kind: 'features', variant: 'list', title: '服務', items: [{ title: '服務一', text: '一句話' }, { title: '服務二', text: '一句話' }, { title: '服務三', text: '一句話' }] }] });

export const BRAND_TEMPLATES: SiteTemplate[] = [
  {
    id: 'brand-portfolio-minimal', category: 'brand', name: '作品集', style: '極簡', tagline: '瀑布作品格為主，關於一段、聯絡一行', tags: ['作品集', '設計師', '攝影'], source: 'Wix 作品集／參考站松原好日骨架',
    theme: { mode: 'light', accent: '#171717', font: 'sans', radius: 'none', header: 'minimal', footer: 'minimal', container: 'wide' },
    menu: { header: [{ label: '作品', href: '/' }, { label: '關於', href: '/p/about' }, { label: '消息', href: '/blog' }, { label: '聯絡', href: '/p/contact' }], footer: [] },
    home: [
      { kind: 'hero', variant: 'left', title: '你的名字 · 設計', subtitle: '一句話。', compact: true },
      { kind: 'gallery', variant: 'masonry', columns: 3, items: [] },
      { kind: 'split', title: '關於', text: '兩三句。', imageSide: 'left', ctaText: '更多', ctaHref: '/p/about' },
      { kind: 'contact', variant: 'columns', items: [{ icon: 'mail', label: 'Email', value: 'hello@example.com', href: 'mailto:hello@example.com' }, { icon: 'camera', label: 'Instagram', value: '@me', href: '' }] },
    ],
    pages: [aboutMe(), PAGES.contact()],
  },
  {
    id: 'brand-personal-onepage', category: 'brand', name: '個人品牌單頁', style: '親和', tagline: '自我介紹、專長、作品或文章、見證、聯絡', tags: ['個人', '講師', '接案'], source: '個人品牌案例骨架',
    theme: { mode: 'light', accent: '#2563eb', font: 'rounded', radius: 'xl', header: 'centered', footer: 'simple' },
    menu: { header: [{ label: '介紹', href: '/#about' }, { label: '專長', href: '/#skills' }, { label: '文章', href: '/blog' }, { label: '聯絡', href: '/#contact' }], footer: MENU.footerBasic },
    home: [
      { kind: 'hero', id: 'about', variant: 'split', kicker: '你好', title: '我是你的名字', subtitle: '一句話說你做什麼、幫誰。', ctaText: '找我合作', ctaHref: '#contact', imageSide: 'left' },
      { kind: 'features', id: 'skills', variant: 'icons', title: '專長', columns: 3, items: [{ icon: 'pen', title: '專長一', text: '一句話' }, { icon: 'mic', title: '專長二', text: '一句話' }, { icon: 'chart-bar', title: '專長三', text: '一句話' }] },
      { kind: 'posts', variant: 'grid', title: '最新文章', limit: 3 },
      { kind: 'testimonials', variant: 'quotes', items: [{ quote: '一句原話。', name: '合作夥伴', role: '職稱' }, { quote: '一句原話。', name: '合作夥伴', role: '職稱' }] },
      { kind: 'contact', id: 'contact', variant: 'cards', title: '聯絡我', items: [{ icon: 'mail', label: 'Email', value: 'hello@example.com', href: 'mailto:hello@example.com' }, { icon: 'chat', label: 'LINE', value: '@me', href: '' }] },
    ],
    pages: [aboutMe(), PAGES.contact()],
  },
  {
    id: 'brand-studio-editorial', category: 'brand', name: '設計工作室', style: '編輯', tagline: '大字主視覺、作品格、服務、客戶牆、CTA', tags: ['工作室', '設計', '品牌'], source: 'Wix 創意機構 (現代)／梧同設計骨架',
    theme: { mode: 'light', accent: '#111827', font: 'display', radius: 'none', header: 'bar', footer: 'columns', heading: 'display' },
    menu: { header: brandNav([{ label: '作品', href: '/p/works' }, { label: '服務', href: '/#services' }]), footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'editorial', kicker: 'STUDIO', title: '品牌，\n從一個好問題開始。', subtitle: '一句話。', ctaText: '看作品', ctaHref: '/p/works' },
      { kind: 'gallery', variant: 'grid', columns: 3, items: [] },
      { kind: 'features', id: 'services', variant: 'list', title: '服務', items: [{ title: '品牌識別', text: '一句話' }, { title: '包裝設計', text: '一句話' }, { title: '網站設計', text: '一句話' }, { title: '空間視覺', text: '一句話' }] },
      { kind: 'logos', title: '合作過', items: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }, { name: 'F' }] },
      { kind: 'cta', variant: 'band', title: '有專案想聊？', buttonText: '聯絡我們', buttonHref: '/p/contact' },
    ],
    pages: [works(), aboutMe('關於工作室'), PAGES.contact()],
  },
  {
    id: 'brand-lifestyle-story', category: 'brand', name: '生活風格品牌', style: '故事', tagline: '滿版主視覺、兩段圖文故事、圖片帶、商品、文章', tags: ['生活', '選物', '故事'], source: '參考站生活風格品牌骨架',
    theme: { mode: 'light', accent: '#78716c', font: 'serif', radius: 'sm', header: 'centered', footer: 'columns' },
    menu: { header: brandNav([{ label: '商品', href: '/store' }, { label: '日誌', href: '/blog' }]), footer: MENU.footerShop },
    home: [
      { kind: 'hero', variant: 'cover', title: '慢一點，生活才看得見', subtitle: '一句話。', ctaText: '認識我們', ctaHref: '/p/about', tone: 'image' },
      { kind: 'split', title: '故事一', text: '兩三句。', imageSide: 'right' },
      { kind: 'split', title: '故事二', text: '兩三句。', imageSide: 'left' },
      { kind: 'gallery', variant: 'strip', columns: 4, items: [] },
      { kind: 'products', variant: 'grid', title: '選物', columns: 3, limit: 6 },
      { kind: 'posts', variant: 'list', title: '日誌', limit: 4 },
      { kind: 'cta', variant: 'card', title: '訂閱日誌', buttonText: '加入會員', buttonHref: '/register' },
    ],
    pages: [aboutMe('關於品牌'), PAGES.contact()],
  },
  {
    id: 'brand-creator-dark', category: 'brand', name: '創作者', style: '深色', tagline: '主視覺、影片、文章格、商品帶、訂閱 CTA', tags: ['YouTuber', 'Podcast', '創作者'], source: 'Wix 影片／音樂類骨架',
    theme: { mode: 'dark', accent: '#f43f5e', font: 'display', radius: 'xl', header: 'minimal', footer: 'minimal', heading: 'bold' },
    menu: { header: [{ label: '影片', href: '/#video' }, { label: '文章', href: '/blog' }, { label: '周邊', href: '/store' }, { label: '關於', href: '/p/about' }], footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'center', kicker: '每週更新', title: '你的頻道名', subtitle: '一句話。', ctaText: '訂閱', ctaHref: '/register', cta2Text: '看最新', cta2Href: '#video', tone: 'dark' },
      { kind: 'video', id: 'video', title: '最新一集', videoUrl: '', tone: 'dark' },
      { kind: 'posts', variant: 'grid', title: '文章', limit: 6, tone: 'dark' },
      { kind: 'products', variant: 'strip', title: '周邊', columns: 4, limit: 4, tone: 'dark' },
      { kind: 'cta', variant: 'band', title: '加入會員看完整內容', buttonText: '加入', buttonHref: '/register' },
    ],
    pages: [aboutMe(), PAGES.contact({ tone: 'dark' })],
  },
  {
    id: 'brand-photographer', category: 'brand', name: '攝影師', style: '滿版', tagline: '滿版主視覺、瀑布圖庫、方案表、聯絡', tags: ['攝影', '婚攝', '商攝'], source: 'Wix 攝影類骨架',
    theme: { mode: 'dark', accent: '#e5e5e5', font: 'serif', radius: 'none', header: 'transparent', footer: 'minimal', container: 'wide' },
    menu: { header: [{ label: '作品', href: '/p/works' }, { label: '方案', href: '/#pricing' }, { label: '關於', href: '/p/about' }, { label: '預約', href: '/p/contact' }], footer: [] },
    home: [
      { kind: 'hero', variant: 'cover', title: '你的名字 · 攝影', subtitle: '一句話。', ctaText: '看作品', ctaHref: '/p/works', tone: 'image' },
      { kind: 'gallery', variant: 'masonry', columns: 3, items: [], tone: 'dark' },
      { kind: 'pricing', id: 'pricing', title: '方案', plans: [{ name: '個人寫真', price: 'NT$6,000', features: ['2 小時', '30 張精修'], ctaText: '預約', ctaHref: '/p/contact' }, { name: '婚禮紀錄', price: 'NT$28,000', features: ['全日', '全檔＋精修'], ctaText: '預約', ctaHref: '/p/contact', highlight: true }, { name: '商業攝影', price: '洽談', features: ['依需求'], ctaText: '聯絡', ctaHref: '/p/contact' }], tone: 'dark' },
      { kind: 'contact', variant: 'columns', items: [{ icon: 'mail', label: 'Email', value: 'hello@example.com', href: 'mailto:hello@example.com' }, { icon: 'camera', label: 'Instagram', value: '@me', href: '' }], tone: 'dark' },
    ],
    pages: [works(), aboutMe(), PAGES.contact({ tone: 'dark' })],
  },
  {
    id: 'brand-architect-serif', category: 'brand', name: '建築室內', style: '典雅 · serif', tagline: '左右圖文主視覺、作品格、流程、團隊、聯絡', tags: ['建築', '室內', '空間'], source: 'Wix 建築事務所（精緻）骨架',
    theme: { mode: 'light', accent: '#334155', font: 'serif', radius: 'none', header: 'centered', footer: 'columns', container: 'wide' },
    menu: { header: brandNav([{ label: '作品', href: '/p/works' }, { label: '流程', href: '/#steps' }]), footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'split', kicker: 'ARCHITECTURE · INTERIOR', title: '空間，是生活的容器', subtitle: '一句話。', ctaText: '看作品', ctaHref: '/p/works', imageSide: 'right' },
      { kind: 'gallery', variant: 'grid', title: '精選作品', columns: 3, items: [] },
      { kind: 'steps', id: 'steps', variant: 'timeline', title: '流程', items: [{ title: '諮詢' }, { title: '概念' }, { title: '設計' }, { title: '施工' }, { title: '交屋' }] },
      { kind: 'team', variant: 'grid', title: '團隊', members: [{ name: '主持設計師', role: '建築師' }, { name: '設計師', role: '室內' }, { name: '專案經理', role: '工務' }] },
      { kind: 'contact', variant: 'columns', title: '聯絡', items: [{ icon: 'map-pin', label: '工作室', value: '地址', href: '' }, { icon: 'phone', label: '電話', value: '02-0000-0000', href: 'tel:+886200000000' }] },
    ],
    pages: [works(), aboutMe('關於事務所'), PAGES.contact()],
  },
  {
    id: 'brand-cafe', category: 'brand', name: '咖啡餐飲', style: '暖', tagline: '滿版主視覺、菜單特色、空間圖庫、地圖、公告帶', tags: ['咖啡', '餐廳', '甜點'], source: 'Wix 餐廳及食物類骨架',
    theme: { mode: 'light', accent: '#7c2d12', font: 'serif', radius: 'md', header: 'centered', footer: 'simple' },
    menu: { header: [{ label: '菜單', href: '/#menu' }, { label: '空間', href: '/#gallery' }, { label: '交通', href: '/#map' }, { label: '訂位', href: '/p/contact' }], footer: MENU.footerBasic },
    home: [
      { kind: 'banner', text: '本週公休：週一 · 訂位請來電', href: '/p/contact', tone: 'muted' },
      { kind: 'hero', variant: 'cover', title: '一杯好咖啡的時間', subtitle: '一句話。', ctaText: '看菜單', ctaHref: '#menu', tone: 'image' },
      { kind: 'features', id: 'menu', variant: 'list', title: '菜單特色', items: [{ icon: 'coffee', title: '手沖', text: '一句話' }, { icon: 'coffee', title: '烘焙', text: '一句話' }, { icon: 'cake', title: '甜點', text: '一句話' }] },
      { kind: 'gallery', id: 'gallery', variant: 'grid', title: '空間', columns: 3, items: [] },
      { kind: 'contact', id: 'map', variant: 'map', title: '交通與訂位', mapEmbedUrl: '', items: [{ icon: 'map-pin', label: '地址', value: '地址', href: '' }, { icon: 'clock', label: '營業', value: '11:00–20:00', href: '' }, { icon: 'phone', label: '訂位', value: '02-0000-0000', href: 'tel:+886200000000' }] },
    ],
    pages: [aboutMe('關於我們'), PAGES.contact()],
  },
  {
    id: 'brand-nonprofit', category: 'brand', name: '公益團體', style: '溫暖', tagline: '主視覺、影響數字、使命、參與方式、支持 CTA、消息', tags: ['NGO', '公益', '募款'], source: 'Wix 教育 NGO／動物收容所骨架',
    theme: { mode: 'light', accent: '#059669', font: 'rounded', radius: 'xl', header: 'solid', footer: 'columns', heading: 'bold' },
    menu: { header: brandNav([{ label: '我們在做的事', href: '/#mission' }, { label: '消息', href: '/blog' }, { label: '支持我們', href: '/store' }]), footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'split', title: '讓每一份善意都到位', subtitle: '一句話。', ctaText: '支持我們', ctaHref: '/store', cta2Text: '了解更多', cta2Href: '#mission', imageSide: 'right' },
      { kind: 'stats', variant: 'cards', items: [{ value: '1,200+', label: '受助者' }, { value: '86', label: '志工' }, { value: '12', label: '年' }] },
      { kind: 'split', id: 'mission', title: '我們在做的事', text: '三段以內。', imageSide: 'left', bullets: ['計畫一', '計畫二', '計畫三'] },
      { kind: 'steps', variant: 'cards', title: '三種參與方式', items: [{ title: '捐款', text: '一句話' }, { title: '志工', text: '一句話' }, { title: '分享', text: '一句話' }] },
      { kind: 'posts', variant: 'grid', title: '最新消息', limit: 3 },
      { kind: 'cta', variant: 'band', title: '每月 300 元，改變一個人的一年', buttonText: '定期支持', buttonHref: '/store' },
    ],
    pages: [aboutMe('關於我們'), PAGES.contact()],
  },
  {
    id: 'brand-event', category: 'brand', name: '活動講座', style: '倒數', tagline: '滿版主視覺、亮點、講者、議程、票種、FAQ、CTA', tags: ['活動', '講座', '售票'], source: 'Wix 活動類骨架',
    theme: { mode: 'dark', accent: '#f59e0b', font: 'display', radius: 'md', header: 'minimal', footer: 'minimal', heading: 'display' },
    menu: { header: [{ label: '亮點', href: '/#features' }, { label: '講者', href: '/#speakers' }, { label: '議程', href: '/#agenda' }, { label: '票種', href: '/#tickets' }, { label: '購票', href: '/store' }], footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'cover', kicker: '2026.11.15 · 台北', title: '活動名稱', subtitle: '一句話。', ctaText: '立即購票', ctaHref: '/store', tone: 'dark' },
      { kind: 'features', id: 'features', variant: 'icons', columns: 3, items: [{ icon: 'mic', title: '亮點一', text: '一句話' }, { icon: 'users', title: '亮點二', text: '一句話' }, { icon: 'gift', title: '亮點三', text: '一句話' }], tone: 'dark' },
      { kind: 'team', id: 'speakers', variant: 'grid', title: '講者', members: [{ name: '講者', role: '主題' }, { name: '講者', role: '主題' }, { name: '講者', role: '主題' }, { name: '講者', role: '主題' }], tone: 'dark' },
      { kind: 'steps', id: 'agenda', variant: 'timeline', title: '議程', items: [{ title: '09:30 報到' }, { title: '10:00 開場' }, { title: '11:00 專題一' }, { title: '13:30 專題二' }, { title: '16:00 交流' }], tone: 'dark' },
      { kind: 'pricing', id: 'tickets', title: '票種', plans: [{ name: '早鳥', price: 'NT$1,200', note: '10/31 前', ctaText: '購票', ctaHref: '/store', highlight: true }, { name: '一般', price: 'NT$1,800', ctaText: '購票', ctaHref: '/store' }, { name: 'VIP', price: 'NT$3,600', features: ['前排', '午餐', '講者交流'], ctaText: '購票', ctaHref: '/store' }], tone: 'dark' },
      { kind: 'faq', items: [{ q: '可以退票嗎？', a: '活動前 7 天可退 90%。' }, { q: '有線上場嗎？', a: '有，購票後寄連結。' }], tone: 'dark' },
      { kind: 'cta', variant: 'band', title: '早鳥倒數中', buttonText: '立即購票', buttonHref: '/store' },
    ],
    pages: [PAGES.contact({ tone: 'dark' })],
  },
];

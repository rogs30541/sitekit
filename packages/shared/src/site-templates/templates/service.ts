/** 專業服務類 10 套：事務所、顧問、診所、代操代營運 */
import type { SiteTemplate } from '../common';
import { MENU, PAGES } from '../common';

const svcNav = (extra: { label: string; href: string }[] = []) => [{ label: '首頁', href: '/' }, { label: '服務項目', href: '/p/services' }, ...extra, { label: '關於我們', href: '/p/about' }, { label: '聯絡我們', href: '/p/contact' }];
const svcAbout = (title = '關於我們'): SiteTemplate['pages'][number] => ({ slug: 'about', title, sections: [{ kind: 'hero', variant: 'center', title, compact: true }, { kind: 'split', title: '我們的理念', text: '兩三段。', imageSide: 'left' }, { kind: 'team', variant: 'grid', title: '專業團隊', members: [{ name: '主持人', role: '職稱', bio: '一句話' }, { name: '夥伴', role: '職稱', bio: '一句話' }, { name: '夥伴', role: '職稱', bio: '一句話' }] }, { kind: 'cta', variant: 'band', title: '預約諮詢', buttonText: '聯絡我們', buttonHref: '/p/contact' }] });
const svcPage = (items: { icon?: string; title: string; text: string }[]): SiteTemplate['pages'][number] => ({ slug: 'services', title: '服務項目', sections: [{ kind: 'hero', variant: 'center', title: '服務項目', compact: true }, { kind: 'features', variant: 'list', items }, { kind: 'faq', title: '常見問題', items: [{ q: '如何收費？', a: '初次諮詢免費，後續依項目報價。' }, { q: '需要多久？', a: '視案件複雜度，第一次會談即可估。' }] }, { kind: 'cta', variant: 'card', title: '預約諮詢', buttonText: '聯絡我們', buttonHref: '/p/contact' }] });

export const SERVICE_TEMPLATES: SiteTemplate[] = [
  {
    id: 'service-law-formal', category: 'service', name: '律師事務所', style: '正式', tagline: '左文主視覺、服務領域磚、團隊、數字、最新消息、聯絡', tags: ['法律', '事務所', '正式'], source: 'Wix 律師事務所 (正式) 骨架',
    theme: { mode: 'light', accent: '#1f2937', font: 'serif', radius: 'none', header: 'solid', footer: 'columns' },
    menu: { header: svcNav([{ label: '團隊', href: '/p/about' }, { label: '最新消息', href: '/blog' }]), footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'left', kicker: 'SINCE 2001', title: '把法律，說成你聽得懂的話', subtitle: '一句話。', ctaText: '預約諮詢', ctaHref: '/p/contact', imageUrl: '' },
      { kind: 'categories', variant: 'tiles', title: '服務領域', columns: 4, items: [{ icon: '⚖️', title: '民事', href: '/p/services' }, { icon: '🏢', title: '商事', href: '/p/services' }, { icon: '👨‍👩‍👧', title: '家事', href: '/p/services' }, { icon: '🛡️', title: '刑事', href: '/p/services' }] },
      { kind: 'team', variant: 'grid', title: '律師團隊', members: [{ name: '律師', role: '主持律師' }, { name: '律師', role: '合夥律師' }, { name: '律師', role: '律師' }] },
      { kind: 'stats', variant: 'row', items: [{ value: '20+', label: '年' }, { value: '1,500+', label: '案件' }, { value: '3', label: '據點' }] },
      { kind: 'posts', variant: 'list', title: '最新消息與法律專欄', limit: 4 },
      { kind: 'contact', variant: 'columns', title: '聯絡我們', items: [{ icon: '📍', label: '事務所', value: '地址', href: '' }, { icon: '📞', label: '電話', value: '02-0000-0000', href: 'tel:+886200000000' }, { icon: '✉️', label: 'Email', value: 'law@example.com', href: 'mailto:law@example.com' }] },
    ],
    pages: [svcPage([{ icon: '⚖️', title: '民事', text: '一句話' }, { icon: '🏢', title: '商事', text: '一句話' }, { icon: '👨‍👩‍👧', title: '家事', text: '一句話' }, { icon: '🛡️', title: '刑事', text: '一句話' }]), svcAbout('關於事務所'), PAGES.contact()],
  },
  {
    id: 'service-accounting', category: 'service', name: '會計稅務', style: '俐落', tagline: '左右圖文、服務格、流程、方案表、FAQ、聯絡', tags: ['會計', '記帳', '稅務'], source: 'Wix 理財顧問會計師 (俐落) 骨架',
    theme: { mode: 'light', accent: '#0e7490', font: 'sans', radius: 'sm', header: 'solid', footer: 'columns' },
    menu: { header: svcNav([{ label: '方案', href: '/#pricing' }]), footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'split', title: '帳務交給我們，你專心做生意', subtitle: '一句話。', ctaText: '免費諮詢', ctaHref: '/p/contact', imageSide: 'right' },
      { kind: 'features', variant: 'grid', title: '服務', columns: 3, items: [{ icon: '📒', title: '記帳', text: '一句話' }, { icon: '🧾', title: '報稅', text: '一句話' }, { icon: '🏢', title: '公司登記', text: '一句話' }, { icon: '📈', title: '財務規劃', text: '一句話' }, { icon: '🔍', title: '簽證', text: '一句話' }, { icon: '💬', title: '諮詢', text: '一句話' }] },
      { kind: 'steps', variant: 'numbers', title: '合作流程', items: [{ title: '免費諮詢' }, { title: '簽約交接' }, { title: '每月作業' }, { title: '年度報稅' }] },
      { kind: 'pricing', id: 'pricing', title: '方案', plans: [{ name: '小型', price: 'NT$2,000', period: '/月', features: ['記帳', '申報'], ctaText: '諮詢', ctaHref: '/p/contact' }, { name: '成長', price: 'NT$4,500', period: '/月', features: ['小型全部', '財報', '顧問'], ctaText: '諮詢', ctaHref: '/p/contact', highlight: true }, { name: '客製', price: '洽談', ctaText: '聯絡', ctaHref: '/p/contact' }] },
      { kind: 'faq', items: [{ q: '什麼時候要換會計師？', a: '一句話。' }, { q: '資料怎麼交？', a: '線上上傳即可。' }] },
      { kind: 'contact', variant: 'cards', title: '聯絡', items: [{ icon: '📞', label: '電話', value: '02-0000-0000', href: 'tel:+886200000000' }, { icon: '✉️', label: 'Email', value: 'hello@example.com', href: 'mailto:hello@example.com' }] },
    ],
    pages: [svcPage([{ title: '記帳', text: '一句話' }, { title: '報稅', text: '一句話' }, { title: '公司登記', text: '一句話' }]), svcAbout(), PAGES.contact()],
  },
  {
    id: 'service-consulting-editorial', category: 'service', name: '顧問公司', style: '編輯', tagline: '大字主視覺、數字、服務清單、見證、CTA', tags: ['顧問', '策略', 'B2B'], source: 'Wix 商業顧問 (編輯) 骨架',
    theme: { mode: 'light', accent: '#0f172a', font: 'display', radius: 'none', header: 'bar', footer: 'simple', heading: 'display' },
    menu: { header: svcNav([{ label: '案例', href: '/blog' }]), footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'editorial', kicker: 'STRATEGY', title: '先想清楚，\n再開始做。', subtitle: '一句話。', ctaText: '預約會談', ctaHref: '/p/contact' },
      { kind: 'stats', variant: 'inline', items: [{ value: '80+', label: '企業客戶' }, { value: '15', label: '年' }, { value: '3.4x', label: '平均成長' }] },
      { kind: 'features', variant: 'list', title: '服務', items: [{ title: '策略規劃', text: '一句話' }, { title: '營運改善', text: '一句話' }, { title: '數位轉型', text: '一句話' }, { title: '主管教練', text: '一句話' }] },
      { kind: 'testimonials', variant: 'single', items: [{ quote: '一句客戶原話。', name: '客戶', role: '執行長' }] },
      { kind: 'cta', variant: 'band', title: '先聊 30 分鐘', buttonText: '預約', buttonHref: '/p/contact' },
    ],
    pages: [svcPage([{ title: '策略規劃', text: '一句話' }, { title: '營運改善', text: '一句話' }, { title: '數位轉型', text: '一句話' }]), svcAbout(), PAGES.contact()],
  },
  {
    id: 'service-clinic-soft', category: 'service', name: '診所', style: '柔和', tagline: '左右圖文、服務、醫師團隊、就診流程、FAQ、地圖', tags: ['診所', '醫美', '牙醫'], source: 'Wix 醫生 (現代)／美學醫美診所 (柔和) 骨架',
    theme: { mode: 'light', accent: '#0ea5e9', font: 'rounded', radius: 'xl', header: 'solid', footer: 'columns' },
    menu: { header: svcNav([{ label: '醫師', href: '/p/about' }, { label: '就診須知', href: '/p/faq' }]), footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'split', title: '安心，從第一次看診開始', subtitle: '一句話。', ctaText: '線上預約', ctaHref: '/p/contact', imageSide: 'right', tone: 'muted' },
      { kind: 'features', variant: 'icons', title: '服務項目', columns: 4, items: [{ icon: '🦷', title: '項目一', text: '一句話' }, { icon: '💉', title: '項目二', text: '一句話' }, { icon: '🩺', title: '項目三', text: '一句話' }, { icon: '✨', title: '項目四', text: '一句話' }] },
      { kind: 'team', variant: 'grid', title: '醫師團隊', members: [{ name: '醫師', role: '院長' }, { name: '醫師', role: '主治' }, { name: '醫師', role: '主治' }] },
      { kind: 'steps', variant: 'numbers', title: '就診流程', items: [{ title: '預約' }, { title: '報到' }, { title: '看診' }, { title: '衛教' }] },
      { kind: 'faq', items: [{ q: '需要預約嗎？', a: '建議線上預約。' }, { q: '有健保嗎？', a: '部分項目適用。' }] },
      { kind: 'contact', variant: 'map', title: '交通', mapEmbedUrl: '', items: [{ icon: '📍', label: '地址', value: '地址', href: '' }, { icon: '🕒', label: '門診', value: '09:00–21:00', href: '' }, { icon: '📞', label: '預約', value: '02-0000-0000', href: 'tel:+886200000000' }] },
    ],
    pages: [svcPage([{ title: '項目一', text: '一句話' }, { title: '項目二', text: '一句話' }, { title: '項目三', text: '一句話' }]), svcAbout('關於診所'), PAGES.faq([{ q: '初診要帶什麼？', a: '健保卡與身分證。' }, { q: '可以取消預約嗎？', a: '前一天來電即可。' }]), PAGES.contact()],
  },
  {
    id: 'service-agency-video', category: 'service', name: '短影音代操', style: '黑紅宣言', tagline: '滿版宣言、論點與數字、黏性影片服務清單、案例數字、實績牆、見證、聯絡', tags: ['代操', '短影音', '行銷'], source: '指定成品站 airuru.cc 完整骨架',
    theme: { mode: 'dark', accent: '#ff3b30', font: 'display', radius: 'sm', header: 'bar', footer: 'minimal', heading: 'display' },
    menu: { header: [{ label: '我們的服務', href: '/#services' }, { label: '實戰案例', href: '/#cases' }, { label: '保證班', href: '/courses' }, { label: '知識庫', href: '/blog' }, { label: '關於我們', href: '/p/about' }, { label: '免費諮詢', href: '/#contact' }], footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'cover', kicker: '台灣頂尖短影音行銷團隊', title: '只講流量，\n不講變現，\n那就是空談。', ctaText: '免費諮詢', ctaHref: '#contact', tone: 'dark' },
      { kind: 'split', title: '流量會漲。生意不一定會。', text: '三段講你的核心觀點與驗收標準。', imageSide: 'right', tone: 'dark' },
      { kind: 'stats', variant: 'cards', items: [{ value: '1.5%', label: '破百萬的機率', note: '1,416 支裡只有 21 支' }, { value: '33,000', label: '中位數播放', note: '平均被少數爆款拉高' }, { value: '9.5%', label: '後半段的貢獻', note: '708 支加起來' }], tone: 'dark' },
      { kind: 'stats', variant: 'inline', items: [{ value: '2 億+', label: '累積播放' }, { value: '1 億+', label: '實際變現' }], tone: 'dark' },
      { kind: 'split', id: 'services', title: '我們的服務', text: '', sticky: true, imageSide: 'left', videoUrl: '', bullets: ['短影音代營運：企劃文案拍攝剪輯一條龍', '百萬流量保證班：線上學習，線下實操', '企業內訓：為團隊量身訂製', '顧問陪跑：每個關鍵節點的專業指導'], tone: 'dark' },
      { kind: 'stats', id: 'cases', variant: 'cards', title: '實戰案例', subtitle: '數據是我們唯一的語言，成果是我們唯一的證明', items: [{ value: '40,000+', label: '全網粉絲', note: '客戶 A · 零售' }, { value: '4,500 萬', label: '一年半純短影音變現', note: '客戶 A' }, { value: '300 萬', label: '0-1 啟動兩週', note: '客戶 B' }], tone: 'dark' },
      { kind: 'gallery', variant: 'grid', title: '實績戰報', columns: 6, items: [], tone: 'dark' },
      { kind: 'testimonials', variant: 'cards', title: '他們都做到了', items: [{ quote: '一句原話。', name: '客戶', role: '產業' }, { quote: '一句原話。', name: '客戶', role: '產業' }, { quote: '一句原話。', name: '客戶', role: '產業' }, { quote: '一句原話。', name: '客戶', role: '產業' }], tone: 'dark' },
      { kind: 'contact', id: 'contact', variant: 'cards', title: '你看完了。你的客戶也會。', items: [{ icon: '💬', label: 'LINE', value: '@yourbrand', href: '' }, { icon: '✉️', label: 'Email', value: 'hello@example.com', href: 'mailto:hello@example.com' }, { icon: '📞', label: '電話', value: '02-0000-0000', href: 'tel:+886200000000' }], tone: 'dark' },
    ],
    pages: [{ slug: 'about', title: '關於我們', sections: [{ kind: 'hero', variant: 'center', title: '關於我們', subtitle: '一群熱愛短影音創作的行銷人', compact: true }, { kind: 'team', variant: 'founder', title: '創辦人', members: [{ name: '創辦人', role: '創辦人', bio: '三段以內。' }] }, { kind: 'features', variant: 'grid', title: '我們的使命', columns: 3, items: [{ icon: '🎯', title: '使命一', text: '一句話' }, { icon: '⚡', title: '使命二', text: '一句話' }, { icon: '🤝', title: '使命三', text: '一句話' }] }, { kind: 'team', variant: 'grid', title: '專業團隊', members: [{ name: '夥伴', role: '策略' }, { name: '夥伴', role: '製作' }, { name: '夥伴', role: '投放' }] }, { kind: 'cta', variant: 'band', title: '準備好一起創造成績了嗎？', buttonText: '免費諮詢', buttonHref: '/p/contact' }] }, svcPage([{ icon: '🎬', title: '代營運', text: '一句話' }, { icon: '🏅', title: '保證班', text: '一句話' }, { icon: '🏢', title: '企業內訓', text: '一句話' }, { icon: '🚀', title: '顧問陪跑', text: '一句話' }]), PAGES.contact({ tone: 'dark' })],
  },
  {
    id: 'service-realestate-agent', category: 'service', name: '房仲', style: '動態', tagline: '滿版主視覺、物件分類、物件圖庫、見證、聯絡', tags: ['房仲', '不動產', '仲介'], source: 'Wix 房地產代理商（動態）骨架',
    theme: { mode: 'light', accent: '#b91c1c', font: 'sans', radius: 'md', header: 'solid', footer: 'columns', heading: 'bold' },
    menu: { header: svcNav([{ label: '物件', href: '/#listings' }]), footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'cover', title: '找到回家的那一間', subtitle: '一句話。', ctaText: '看物件', ctaHref: '#listings', cta2Text: '委託出售', cta2Href: '/p/contact', tone: 'image' },
      { kind: 'categories', variant: 'tiles', columns: 4, items: [{ title: '大樓', href: '#listings' }, { title: '公寓', href: '#listings' }, { title: '透天', href: '#listings' }, { title: '店面', href: '#listings' }] },
      { kind: 'gallery', id: 'listings', variant: 'grid', title: '精選物件', columns: 3, items: [] },
      { kind: 'testimonials', variant: 'cards', title: '客戶怎麼說', items: [{ quote: '一句原話。', name: '客戶' }, { quote: '一句原話。', name: '客戶' }, { quote: '一句原話。', name: '客戶' }] },
      { kind: 'contact', variant: 'cards', title: '聯絡', items: [{ icon: '📞', label: '電話', value: '0900-000-000', href: 'tel:+886900000000' }, { icon: '💬', label: 'LINE', value: '@agent', href: '' }] },
    ],
    pages: [svcPage([{ title: '買屋', text: '一句話' }, { title: '賣屋', text: '一句話' }, { title: '租賃', text: '一句話' }]), svcAbout('關於我'), PAGES.contact()],
  },
  {
    id: 'service-coach-consult', category: 'service', name: '教練諮商', style: '沉靜', tagline: '左右圖文、理念、服務、方案、FAQ、聯絡', tags: ['諮商', '教練', '身心'], source: 'Wix 專業理財教練 (沉靜)／治療師骨架',
    theme: { mode: 'light', accent: '#4b5563', font: 'serif', radius: 'xl', header: 'centered', footer: 'simple', container: 'narrow' },
    menu: { header: svcNav([{ label: '方案', href: '/#pricing' }]), footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'split', title: '慢慢來，比較快', subtitle: '一句話。', ctaText: '預約初談', ctaHref: '/p/contact', imageSide: 'left', tone: 'muted' },
      { kind: 'split', title: '我的方式', text: '兩三段。', imageSide: 'right' },
      { kind: 'features', variant: 'list', title: '服務', items: [{ title: '個別會談', text: '一句話' }, { title: '伴侶會談', text: '一句話' }, { title: '團體工作坊', text: '一句話' }] },
      { kind: 'pricing', id: 'pricing', plans: [{ name: '初談', price: 'NT$1,200', period: '/50 分', ctaText: '預約', ctaHref: '/p/contact' }, { name: '六次方案', price: 'NT$9,600', note: '省 1,200', ctaText: '預約', ctaHref: '/p/contact', highlight: true }] },
      { kind: 'faq', items: [{ q: '第一次會談做什麼？', a: '一句話。' }, { q: '可以線上嗎？', a: '可以。' }] },
      { kind: 'contact', variant: 'columns', items: [{ icon: '✉️', label: 'Email', value: 'hello@example.com', href: 'mailto:hello@example.com' }, { icon: '📍', label: '工作室', value: '地址', href: '' }] },
    ],
    pages: [svcPage([{ title: '個別會談', text: '一句話' }, { title: '伴侶會談', text: '一句話' }]), svcAbout('關於我'), PAGES.contact()],
  },
  {
    id: 'service-it-saas', category: 'service', name: 'IT／SaaS 服務', style: '現代', tagline: '置中主視覺、客戶牆、功能、圖文、方案、FAQ、CTA', tags: ['IT', '軟體', 'SaaS'], source: '參考站 Teachify／Wix SAAS company 骨架',
    theme: { mode: 'light', accent: '#4f46e5', font: 'sans', radius: 'xl', header: 'solid', footer: 'columns' },
    menu: { header: [{ label: '功能', href: '/#features' }, { label: '價格', href: '/#pricing' }, { label: '案例', href: '/blog' }, { label: '常見問題', href: '/#faq' }, { label: '免費試用', href: '/register' }], footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'center', kicker: '100+ 團隊使用', title: '輕鬆建立你的線上業務', subtitle: '一句話。', ctaText: '免費試用', ctaHref: '/register', cta2Text: '預約展示', cta2Href: '/p/contact' },
      { kind: 'logos', items: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }, { name: 'F' }] },
      { kind: 'features', id: 'features', variant: 'grid', title: '功能特色', columns: 3, items: [{ icon: '⚡', title: '功能一', text: '一句話' }, { icon: '🔗', title: '功能二', text: '一句話' }, { icon: '📊', title: '功能三', text: '一句話' }, { icon: '🛡️', title: '功能四', text: '一句話' }, { icon: '🤖', title: '功能五', text: '一句話' }, { icon: '🌐', title: '功能六', text: '一句話' }] },
      { kind: 'split', title: '一個場景', text: '三句。', imageSide: 'right' },
      { kind: 'pricing', id: 'pricing', title: '價格方案', plans: [{ name: '免費', price: 'NT$0', features: ['基本'], ctaText: '開始', ctaHref: '/register' }, { name: '專業', price: 'NT$1,290', period: '/月', features: ['全部功能'], ctaText: '試用', ctaHref: '/register', highlight: true }, { name: '企業', price: '洽談', ctaText: '聯絡', ctaHref: '/p/contact' }] },
      { kind: 'faq', id: 'faq', items: [{ q: '可以匯入現有資料嗎？', a: '可以。' }, { q: '資料放哪裡？', a: '一句話。' }] },
      { kind: 'cta', variant: 'band', title: '14 天免費試用', buttonText: '立即開始', buttonHref: '/register' },
    ],
    pages: [svcAbout(), PAGES.contact()],
  },
  {
    id: 'service-beauty-salon', category: 'service', name: '美業沙龍', style: '精緻', tagline: '滿版主視覺、服務項目磚、價目表、作品圖庫、設計師、聯絡', tags: ['美髮', '美甲', '沙龍'], source: 'Wix 美容美髮類骨架',
    theme: { mode: 'light', accent: '#be185d', font: 'serif', radius: 'xl', header: 'centered', footer: 'simple' },
    menu: { header: [{ label: '服務', href: '/#services' }, { label: '價目', href: '/#pricing' }, { label: '作品', href: '/#gallery' }, { label: '設計師', href: '/#team' }, { label: '預約', href: '/p/contact' }], footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'cover', title: '今天，換個樣子', subtitle: '一句話。', ctaText: '線上預約', ctaHref: '/p/contact', tone: 'image' },
      { kind: 'categories', id: 'services', variant: 'tiles', title: '服務項目', columns: 4, items: [{ icon: '✂️', title: '剪髮', href: '#pricing' }, { icon: '🎨', title: '染髮', href: '#pricing' }, { icon: '💆', title: '護髮', href: '#pricing' }, { icon: '💅', title: '美甲', href: '#pricing' }] },
      { kind: 'pricing', id: 'pricing', title: '價目', plans: [{ name: '剪髮', price: 'NT$800 起', ctaText: '預約', ctaHref: '/p/contact' }, { name: '染髮', price: 'NT$2,800 起', ctaText: '預約', ctaHref: '/p/contact', highlight: true }, { name: '護髮', price: 'NT$1,500 起', ctaText: '預約', ctaHref: '/p/contact' }] },
      { kind: 'gallery', id: 'gallery', variant: 'grid', title: '作品', columns: 4, items: [] },
      { kind: 'team', id: 'team', variant: 'grid', title: '設計師', members: [{ name: '設計師', role: '店長' }, { name: '設計師', role: '資深' }, { name: '設計師', role: '設計師' }] },
      { kind: 'contact', variant: 'map', title: '預約與交通', mapEmbedUrl: '', items: [{ icon: '📍', label: '地址', value: '地址', href: '' }, { icon: '📞', label: '預約', value: '02-0000-0000', href: 'tel:+886200000000' }] },
    ],
    pages: [svcAbout('關於沙龍'), PAGES.contact()],
  },
  {
    id: 'service-onestop-firm', category: 'service', name: '一站式事務所', style: '巨型選單', tagline: '三事務所分頁卡、服務磚、網絡會員牆、團隊、消息、聯絡', tags: ['律師', '會計', '顧問'], source: '參考站國巨事務所骨架',
    theme: { mode: 'light', accent: '#1e3a8a', font: 'sans', radius: 'sm', header: 'solid', footer: 'columns', container: 'wide' },
    menu: { header: [{ label: '關於', href: '/p/about' }, { label: '服務項目', href: '/p/services' }, { label: '團隊', href: '/p/about' }, { label: '最新消息', href: '/blog' }, { label: '聯絡', href: '/p/contact' }], footer: MENU.footerBasic },
    home: [
      { kind: 'hero', variant: 'left', title: '跨境訴訟、非訟、稅務與管理的一站式服務', subtitle: '一句話。', ctaText: '預約諮詢', ctaHref: '/p/contact' },
      { kind: 'features', variant: 'tabs', columns: 3, items: [{ code: 'LAW', title: '律師事務所', text: '一句話', href: '/p/services' }, { code: 'CPA', title: '會計師事務所', text: '一句話', href: '/p/services' }, { code: 'MGMT', title: '管理顧問', text: '一句話', href: '/p/services' }] },
      { kind: 'categories', variant: 'tiles', title: '服務項目', columns: 4, items: [{ title: '公共政策', href: '/p/services' }, { title: '移民簽證', href: '/p/services' }, { title: '人力資源法律', href: '/p/services' }, { title: '投資併購', href: '/p/services' }, { title: '電子商務', href: '/p/services' }, { title: '教育訓練', href: '/p/services' }, { title: '資訊規劃', href: '/p/services' }, { title: '稅務簽證', href: '/p/services' }] },
      { kind: 'logos', title: '國際網絡會員', items: [{ name: 'Network A' }, { name: 'Network B' }, { name: 'Network C' }] },
      { kind: 'team', variant: 'list', title: '團隊', members: [{ name: '合夥律師', role: '律師', bio: '一句話' }, { name: '會計師', role: '會計師', bio: '一句話' }, { name: '顧問', role: '顧問', bio: '一句話' }] },
      { kind: 'posts', variant: 'list', title: '最新消息', limit: 4 },
      { kind: 'contact', variant: 'columns', title: '聯絡', items: [{ icon: '📍', label: '台北', value: '地址', href: '' }, { icon: '📞', label: '電話', value: '02-0000-0000', href: 'tel:+886200000000' }, { icon: '✉️', label: 'Email', value: 'info@example.com', href: 'mailto:info@example.com' }] },
    ],
    pages: [svcPage([{ title: '律師事務所', text: '一句話' }, { title: '會計師事務所', text: '一句話' }, { title: '管理顧問', text: '一句話' }]), svcAbout('關於事務所'), PAGES.contact()],
  },
];

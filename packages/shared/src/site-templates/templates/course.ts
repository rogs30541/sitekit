/** 課程類 10 套：線上課程、講師、學院、會員專區 */
import type { SiteTemplate } from '../common';
import { MENU, PAGES } from '../common';

const courseNav = (extra: { label: string; href: string }[] = []) => [{ label: '首頁', href: '/' }, { label: '找課程', href: '/courses' }, ...extra, { label: '常見問題', href: '/p/faq' }, { label: '我的課程', href: '/member' }];
const courseFaq = PAGES.faq([{ q: '購買後可以看多久？', a: '無限期觀看。' }, { q: '可以在手機看嗎？', a: '可以，電腦、手機、平板都支援。' }, { q: '可以退費嗎？', a: '開課 7 天內且觀看未達 20% 可退。' }, { q: '有發票嗎？', a: '付款後自動開立電子發票。' }]);
const aboutSchool: SiteTemplate['pages'][number] = { slug: 'about', title: '關於我們', sections: [{ kind: 'hero', variant: 'center', title: '關於我們', compact: true }, { kind: 'split', title: '為什麼開這些課', text: '兩三段。', imageSide: 'left' }, { kind: 'team', variant: 'grid', title: '講師群', members: [{ name: '講師', role: '主題', bio: '一句話' }, { name: '講師', role: '主題', bio: '一句話' }, { name: '講師', role: '主題', bio: '一句話' }] }, { kind: 'cta', variant: 'band', title: '找到適合你的課', buttonText: '找課程', buttonHref: '/courses' }] };

export const COURSE_TEMPLATES: SiteTemplate[] = [
  {
    id: 'course-master-platform', category: 'course', name: '大師課程平台', style: '深色 · 市集', tagline: '輪播主視覺、募資課、陪跑課、熱門排行、分類磚、限時優惠、專欄、影片', tags: ['多講師', '市集', '募資'], source: '指定成品站 shifu.tw 骨架',
    theme: { mode: 'dark', accent: '#e11d48', font: 'sans', radius: 'md', header: 'solid', footer: 'columns', container: 'wide' },
    menu: { header: [{ label: '找課程', href: '/courses' }, { label: '找講師', href: '/p/teachers' }, { label: '看文章', href: '/blog' }, { label: '常見問題', href: '/p/faq' }, { label: '我的課程', href: '/member' }], footer: MENU.footerCourse },
    home: [
      { kind: 'hero', variant: 'carousel', slides: [{ title: '本月主打課程', subtitle: '講師 · 一句話', ctaText: '立即上課', ctaHref: '/courses' }, { title: '新課上線', subtitle: '講師 · 一句話', ctaText: '看課程', ctaHref: '/courses' }], tone: 'dark' },
      { kind: 'courses', variant: 'progress', title: '募資課程', columns: 3, limit: 3, ctaText: '更多課程', ctaHref: '/courses', tone: 'dark' },
      { kind: 'courses', variant: 'strip', title: '實戰陪跑課', columns: 4, limit: 4, tone: 'dark' },
      { kind: 'courses', variant: 'ranking', title: '熱門排行', columns: 4, limit: 6, tone: 'dark' },
      { kind: 'categories', variant: 'icons', title: '課程分類', columns: 4, items: [{ icon: '💼', title: '職場技能', href: '/courses' }, { icon: '📈', title: '商業理財', href: '/courses' }, { icon: '🗣️', title: '語言學習', href: '/courses' }, { icon: '🌱', title: '自我成長', href: '/courses' }, { icon: '🎨', title: '興趣愛好', href: '/courses' }, { icon: '💻', title: '數位工具', href: '/courses' }, { icon: '🏃', title: '健康運動', href: '/courses' }, { icon: '🍳', title: '生活料理', href: '/courses' }], tone: 'dark' },
      { kind: 'courses', variant: 'grid', title: '限時優惠', columns: 4, limit: 4, tone: 'dark' },
      { kind: 'posts', variant: 'grid', title: '推薦專欄', limit: 3, tone: 'dark' },
      { kind: 'video', title: '看看學員怎麼說', videoUrl: '', tone: 'dark' },
    ],
    pages: [{ slug: 'teachers', title: '講師', sections: [{ kind: 'hero', variant: 'center', title: '講師', compact: true }, { kind: 'team', variant: 'list', members: [{ name: '講師 A', role: '主題', bio: '兩句話' }, { name: '講師 B', role: '主題', bio: '兩句話' }, { name: '講師 C', role: '主題', bio: '兩句話' }] }] }, courseFaq, aboutSchool, PAGES.contact({ tone: 'dark' })],
  },
  {
    id: 'course-toolbox-dashboard', category: 'course', name: '會員工具箱', style: '儀表板 · 深色', tagline: '登入後首頁：問候、分類分頁卡、代號卡片格，適合學院／會員專區', tags: ['會員專區', '工具箱', '學院'], source: '指定成品站 ifreeaprogram.com/dashboard 骨架',
    theme: { mode: 'dark', accent: '#5eead4', accent2: '#fbbf24', font: 'mono', radius: 'md', header: 'bar', footer: 'minimal' },
    menu: { header: [{ label: '工具箱', href: '/' }, { label: '教學', href: '/courses' }, { label: '文章', href: '/blog' }, { label: '會員中心', href: '/member' }], footer: MENU.footerCourse },
    home: [
      { kind: 'hero', variant: 'dashboard', kicker: 'YOUR TOOLBOX', title: '歡迎回來', subtitle: '從「學」到「做」的完整工具都在下方，照你的節奏選擇。', tone: 'dark' },
      { kind: 'features', variant: 'tabs', columns: 4, items: [{ code: 'ALL', title: '看全部', tag: '12' }, { code: 'LEARN', title: '教學篇', tag: '4' }, { code: 'PRACTICE', title: '實作篇', tag: '6' }, { code: 'TOOL', title: '程式區', tag: '2' }], tone: 'dark' },
      { kind: 'features', variant: 'grid', columns: 2, items: [{ code: 'L01 · LEARN', tag: 'LEARN', title: '上手教學', text: '平台操作導覽與基礎心法。', href: '/courses', ctaText: '進入教學 →' }, { code: 'L02 · COURSE', tag: 'LEARN', title: '旗艦課程', text: '分階段影片，從觀念到實作。', href: '/courses', ctaText: '進入課程 →' }, { code: 'P01 · PRACTICE', tag: 'PRACTICE', title: '模擬實作', text: '跟著關卡一步步做。', href: '/courses', ctaText: '進入副本 →' }, { code: 'T01 · TOOL', tag: 'TOOL', title: '產生器工具', text: '一鍵產出可交付的成品。', href: '/member', ctaText: '開啟工具 →' }], tone: 'dark' },
      { kind: 'cta', variant: 'card', title: '課程不懂可以問', text: '任何卡住的地方，留言就有人回。', buttonText: '去發問', buttonHref: '/member', tone: 'dark' },
    ],
    pages: [aboutSchool, courseFaq, PAGES.contact({ tone: 'dark' })],
  },
  {
    id: 'course-academy-classic', category: 'course', name: '線上學院', style: '經典', tagline: '課程格、為何選我們、講師、見證、方案、FAQ', tags: ['學院', '多課程', '訂閱'], source: 'Wix 教育／線上課程平台骨架',
    theme: { mode: 'light', accent: '#1d4ed8', font: 'sans', radius: 'md', header: 'solid', footer: 'columns' },
    menu: { header: courseNav([{ label: '講師', href: '/p/about' }]), footer: MENU.footerCourse },
    home: [
      { kind: 'hero', variant: 'split', kicker: '線上學院', title: '用最短的路，學會真正有用的事', subtitle: '一句話。', ctaText: '找課程', ctaHref: '/courses', cta2Text: '免費試看', cta2Href: '/courses' },
      { kind: 'courses', variant: 'grid', title: '熱門課程', columns: 3, limit: 6, ctaText: '看全部', ctaHref: '/courses' },
      { kind: 'features', variant: 'icons', title: '為什麼選我們', columns: 3, items: [{ icon: '🎯', title: '實戰導向', text: '一句話' }, { icon: '♾️', title: '無限期觀看', text: '一句話' }, { icon: '💬', title: '講師答疑', text: '一句話' }] },
      { kind: 'team', variant: 'grid', title: '講師', members: [{ name: '講師', role: '主題' }, { name: '講師', role: '主題' }, { name: '講師', role: '主題' }] },
      { kind: 'testimonials', variant: 'cards', title: '學員回饋', items: [{ quote: '一句原話。', name: '學員' }, { quote: '一句原話。', name: '學員' }, { quote: '一句原話。', name: '學員' }] },
      { kind: 'pricing', title: '方案', plans: [{ name: '單堂', price: '依課程', ctaText: '找課程', ctaHref: '/courses' }, { name: '年費會員', price: 'NT$4,990', period: '/年', features: ['全站課程', '新課免費'], ctaText: '加入', ctaHref: '/store', highlight: true }] },
      { kind: 'faq', items: [{ q: '可以看多久？', a: '無限期。' }, { q: '可以退費？', a: '7 天內。' }] },
      { kind: 'cta', variant: 'band', title: '今天開始學', buttonText: '找課程', buttonHref: '/courses' },
    ],
    pages: [aboutSchool, courseFaq, PAGES.contact()],
  },
  {
    id: 'course-single-launch', category: 'course', name: '單一課程銷售頁', style: '長頁', tagline: '主視覺三亮點、痛點、技能、見證、方案價值、完整內容與贈品、FAQ', tags: ['單課', '開課', '轉換'], source: '指定成品站 airuru.cc/courses 骨架',
    theme: { mode: 'dark', accent: '#ff3b30', font: 'display', radius: 'sm', header: 'minimal', footer: 'minimal', heading: 'display' },
    menu: { header: [{ label: '課程內容', href: '/#content' }, { label: '學員見證', href: '/#reviews' }, { label: '方案', href: '/#pricing' }, { label: '立即報名', href: '/courses' }], footer: MENU.footerCourse },
    home: [
      { kind: 'hero', variant: 'center', kicker: '已開課 · 可複製的系統', title: '一支手機，逆襲市場', subtitle: '全台唯一敢保證結果的課程。', ctaText: '立即報名', ctaHref: '/courses', highlights: [{ icon: '🎬', title: '八大內容模組', text: '影片＋實作' }, { icon: '📊', title: '七套系統', text: '每步都有 SOP' }, { icon: '📱', title: '萬用腳本', text: '照抄就能上手' }], tone: 'dark' },
      { kind: 'features', variant: 'grid', title: '你是不是也面臨這些困境？', columns: 4, items: [{ icon: '😵', title: '痛點一', text: '一句話' }, { icon: '😩', title: '痛點二', text: '一句話' }, { icon: '🤯', title: '痛點三', text: '一句話' }, { icon: '😶', title: '痛點四', text: '一句話' }], tone: 'dark' },
      { kind: 'features', id: 'content', variant: 'numbered', title: '你將學會的核心技能', columns: 3, items: [{ code: '01', title: '技能一', text: '一句話' }, { code: '02', title: '技能二', text: '一句話' }, { code: '03', title: '技能三', text: '一句話' }, { code: '04', title: '技能四', text: '一句話' }, { code: '05', title: '技能五', text: '一句話' }, { code: '06', title: '技能六', text: '一句話' }], tone: 'dark' },
      { kind: 'testimonials', id: 'reviews', variant: 'wall', title: '真實案例見證：他們都做到了', items: [{ quote: '一句原話。', name: '學員', metric: '+40,000 粉' }, { quote: '一句原話。', name: '學員', metric: '月營收 ×3' }, { quote: '一句原話。', name: '學員', metric: '第一週破萬' }, { quote: '一句原話。', name: '學員', metric: '轉職成功' }], tone: 'dark' },
      { kind: 'pricing', id: 'pricing', title: '這是一項穩賺不賠的投資', plans: [{ name: '線上班', price: 'NT$12,800', features: ['全部影片', '腳本模板', '社群答疑'], ctaText: '報名', ctaHref: '/courses' }, { name: '保證班', price: 'NT$36,800', note: '未達標退費', features: ['線上班全部', '線下實作', '一對一陪跑'], ctaText: '報名', ctaHref: '/courses', highlight: true }], tone: 'dark' },
      { kind: 'split', title: '完整課程＋全套贈品', text: '列出章節與贈品。', imageSide: 'left', bullets: ['章節一', '章節二', '章節三', '贈品一', '贈品二'], tone: 'dark' },
      { kind: 'faq', items: [{ q: '沒經驗可以嗎？', a: '可以，從零開始。' }, { q: '要多少時間？', a: '每週 3 小時。' }], tone: 'dark' },
      { kind: 'cta', variant: 'band', title: '名額有限，現在報名', buttonText: '立即報名', buttonHref: '/courses' },
    ],
    pages: [courseFaq, PAGES.contact({ tone: 'dark' })],
  },
  {
    id: 'course-coach-personal', category: 'course', name: '個人教練', style: '親切', tagline: '大頭照主視覺、故事、課程清單、見證、三步流程、聯絡', tags: ['個人', '教練', '顧問'], source: 'Wix 專業教練／能量人生教練骨架',
    theme: { mode: 'light', accent: '#0f766e', font: 'rounded', radius: 'xl', header: 'centered', footer: 'simple' },
    menu: { header: courseNav([{ label: '關於我', href: '/p/about' }]), footer: MENU.footerCourse },
    home: [
      { kind: 'hero', variant: 'split', kicker: '你好，我是', title: '你的名字', subtitle: '一句話說你幫誰解決什麼。', ctaText: '看課程', ctaHref: '/courses', cta2Text: '預約諮詢', cta2Href: '/p/contact', imageSide: 'left' },
      { kind: 'split', title: '我的故事', text: '三段以內。', imageSide: 'right' },
      { kind: 'courses', variant: 'list', title: '課程與方案', limit: 4 },
      { kind: 'testimonials', variant: 'quotes', items: [{ quote: '一句原話。', name: '學員' }, { quote: '一句原話。', name: '學員' }] },
      { kind: 'steps', variant: 'numbers', title: '怎麼開始', items: [{ title: '免費諮詢' }, { title: '選課或方案' }, { title: '開始改變' }] },
      { kind: 'contact', variant: 'cards', title: '聯絡我', items: [{ icon: '✉️', label: 'Email', value: 'hello@example.com', href: 'mailto:hello@example.com' }, { icon: '💬', label: 'LINE', value: '@me', href: '' }] },
    ],
    pages: [{ slug: 'about', title: '關於我', sections: [{ kind: 'hero', variant: 'center', title: '關於我', compact: true }, { kind: 'team', variant: 'founder', members: [{ name: '你的名字', role: '教練', bio: '三段以內。' }] }, { kind: 'stats', variant: 'cards', items: [{ value: '10', label: '年' }, { value: '500+', label: '學員' }, { value: '4.9', label: '評分' }] }] }, courseFaq, PAGES.contact()],
  },
  {
    id: 'course-school-bright', category: 'course', name: '才藝教室', style: '活力', tagline: '滿版主視覺、課程分類磚、課程格、教室圖庫、FAQ、地圖', tags: ['教室', '實體', '才藝'], source: 'Wix 音樂學校／烹飪教室骨架',
    theme: { mode: 'light', accent: '#f59e0b', accent2: '#3b82f6', font: 'rounded', radius: 'xl', header: 'solid', footer: 'columns', heading: 'bold' },
    menu: { header: courseNav([{ label: '教室環境', href: '/#gallery' }, { label: '交通', href: '/#map' }]), footer: MENU.footerCourse },
    home: [
      { kind: 'hero', variant: 'cover', title: '玩出興趣，學出能力', subtitle: '一句話。', ctaText: '預約體驗', ctaHref: '/p/contact', tone: 'image' },
      { kind: 'categories', variant: 'tiles', title: '課程分類', columns: 4, items: [{ icon: '🎹', title: '音樂', href: '/courses' }, { icon: '🎨', title: '美術', href: '/courses' }, { icon: '💃', title: '舞蹈', href: '/courses' }, { icon: '🧪', title: '科學', href: '/courses' }] },
      { kind: 'courses', variant: 'grid', title: '本季開班', columns: 3, limit: 6 },
      { kind: 'gallery', id: 'gallery', variant: 'grid', title: '教室環境', columns: 3, items: [] },
      { kind: 'faq', items: [{ q: '幾歲可以上？', a: '4 歲以上。' }, { q: '可以試上嗎？', a: '可以，免費一堂。' }] },
      { kind: 'contact', id: 'map', variant: 'map', title: '交通', mapEmbedUrl: '', items: [{ icon: '📍', label: '教室', value: '地址', href: '' }, { icon: '📞', label: '電話', value: '02-0000-0000', href: 'tel:+886200000000' }] },
    ],
    pages: [aboutSchool, courseFaq, PAGES.contact()],
  },
  {
    id: 'course-workshop-dark', category: 'course', name: '工作坊', style: '編輯 · 深色', tagline: '大字主視覺、數字、課程清單、講師、見證、CTA', tags: ['工作坊', '實體', '進階'], source: 'Wix Martial Arts (Bold)／Acting School 骨架',
    theme: { mode: 'dark', accent: '#a3e635', font: 'display', radius: 'none', header: 'bar', footer: 'minimal', heading: 'display' },
    menu: { header: courseNav([{ label: '講師', href: '/p/about' }]), footer: MENU.footerCourse },
    home: [
      { kind: 'hero', variant: 'editorial', kicker: 'WORKSHOP', title: '兩天，\n把一件事做到會。', subtitle: '一句話。', ctaText: '看場次', ctaHref: '/courses', tone: 'dark' },
      { kind: 'stats', variant: 'inline', items: [{ value: '12', label: '期' }, { value: '480+', label: '結業' }, { value: '9.6', label: '滿意度' }], tone: 'dark' },
      { kind: 'courses', variant: 'list', title: '近期場次', limit: 4, tone: 'dark' },
      { kind: 'team', variant: 'grid', title: '講師', members: [{ name: '講師', role: '主題' }, { name: '講師', role: '主題' }], tone: 'dark' },
      { kind: 'testimonials', variant: 'quotes', items: [{ quote: '一句原話。', name: '學員' }, { quote: '一句原話。', name: '學員' }], tone: 'dark' },
      { kind: 'cta', variant: 'band', title: '下一期報名中', buttonText: '報名', buttonHref: '/courses' },
    ],
    pages: [aboutSchool, courseFaq, PAGES.contact({ tone: 'dark' })],
  },
  {
    id: 'course-membership', category: 'course', name: '訂閱會員制', style: '方案', tagline: '主視覺、內容特色、三方案表、FAQ、CTA', tags: ['訂閱', '會員', '內容'], source: 'Wix Signup LP／訂閱型骨架',
    theme: { mode: 'light', accent: '#7c3aed', font: 'sans', radius: 'xl', header: 'minimal', footer: 'minimal' },
    menu: { header: [{ label: '內容', href: '/#features' }, { label: '方案', href: '/#pricing' }, { label: '常見問題', href: '/#faq' }, { label: '登入', href: '/login' }], footer: MENU.footerCourse },
    home: [
      { kind: 'hero', variant: 'center', kicker: '每週更新', title: '一個訂閱，持續進步', subtitle: '一句話。', ctaText: '開始訂閱', ctaHref: '/store', tone: 'muted' },
      { kind: 'features', id: 'features', variant: 'icons', columns: 3, items: [{ icon: '🎥', title: '影片', text: '一句話' }, { icon: '📄', title: '講義', text: '一句話' }, { icon: '👥', title: '社群', text: '一句話' }] },
      { kind: 'courses', variant: 'grid', title: '最新內容', columns: 3, limit: 3 },
      { kind: 'pricing', id: 'pricing', plans: [{ name: '月繳', price: 'NT$390', period: '/月', ctaText: '訂閱', ctaHref: '/store' }, { name: '年繳', price: 'NT$3,900', period: '/年', note: '省兩個月', ctaText: '訂閱', ctaHref: '/store', highlight: true }, { name: '終身', price: 'NT$12,000', ctaText: '購買', ctaHref: '/store' }] },
      { kind: 'faq', id: 'faq', items: [{ q: '可以隨時取消？', a: '可以。' }, { q: '取消後內容還能看嗎？', a: '到當期結束。' }] },
      { kind: 'cta', variant: 'card', title: '第一週免費', buttonText: '開始訂閱', buttonHref: '/store' },
    ],
    pages: [courseFaq, PAGES.contact()],
  },
  {
    id: 'course-cohort', category: 'course', name: '陪跑實戰班', style: '流程', tagline: '主視覺、時間軸流程、精選課、見證、FAQ、CTA', tags: ['陪跑', '梯次', '實戰'], source: '參考站 shifu 實戰陪跑課骨架',
    theme: { mode: 'light', accent: '#0891b2', font: 'sans', radius: 'md', header: 'solid', footer: 'simple', heading: 'bold' },
    menu: { header: courseNav([{ label: '流程', href: '/#steps' }]), footer: MENU.footerCourse },
    home: [
      { kind: 'hero', variant: 'split', kicker: '第 5 梯', title: '八週，做出你的第一個成果', subtitle: '一句話。', ctaText: '立即報名', ctaHref: '/courses', cta2Text: '看流程', cta2Href: '#steps' },
      { kind: 'steps', id: 'steps', variant: 'timeline', title: '八週流程', items: [{ title: '第 1-2 週：定位', text: '一句話' }, { title: '第 3-4 週：製作', text: '一句話' }, { title: '第 5-6 週：上線', text: '一句話' }, { title: '第 7-8 週：優化', text: '一句話' }] },
      { kind: 'courses', variant: 'featured', title: '本梯課程', columns: 3, limit: 3 },
      { kind: 'testimonials', variant: 'cards', title: '上一梯的成果', items: [{ quote: '一句原話。', name: '學員', metric: '成果數字' }, { quote: '一句原話。', name: '學員', metric: '成果數字' }, { quote: '一句原話。', name: '學員', metric: '成果數字' }] },
      { kind: 'faq', items: [{ q: '一週要花多少時間？', a: '5 小時。' }, { q: '沒有基礎可以嗎？', a: '可以。' }] },
      { kind: 'cta', variant: 'band', title: '名額 20 位', buttonText: '報名', buttonHref: '/courses' },
    ],
    pages: [aboutSchool, courseFaq, PAGES.contact()],
  },
  {
    id: 'course-kids', category: 'course', name: '兒童教育', style: '圓潤', tagline: '主視覺、特色圖示、課程格、老師、教室圖庫、聯絡', tags: ['兒童', '幼教', '安親'], source: 'Wix Kindergarten (Playful)／日間托兒所骨架',
    theme: { mode: 'light', accent: '#f97316', accent2: '#22c55e', font: 'rounded', radius: 'full', header: 'solid', footer: 'columns', heading: 'bold' },
    menu: { header: courseNav([{ label: '老師', href: '/p/about' }, { label: '環境', href: '/#gallery' }]), footer: MENU.footerCourse },
    home: [
      { kind: 'hero', variant: 'split', title: '讓孩子在玩中學', subtitle: '一句話。', ctaText: '預約參觀', ctaHref: '/p/contact', imageSide: 'right', tone: 'muted' },
      { kind: 'features', variant: 'icons', columns: 4, items: [{ icon: '🧩', title: '特色一', text: '一句話' }, { icon: '🌈', title: '特色二', text: '一句話' }, { icon: '🛡️', title: '特色三', text: '一句話' }, { icon: '🍎', title: '特色四', text: '一句話' }] },
      { kind: 'courses', variant: 'grid', title: '課程', columns: 3, limit: 6 },
      { kind: 'team', variant: 'grid', title: '老師', members: [{ name: '老師', role: '主題' }, { name: '老師', role: '主題' }, { name: '老師', role: '主題' }] },
      { kind: 'gallery', id: 'gallery', variant: 'grid', title: '環境', columns: 3, items: [] },
      { kind: 'contact', variant: 'map', title: '預約參觀', mapEmbedUrl: '', items: [{ icon: '📍', label: '地址', value: '地址', href: '' }, { icon: '📞', label: '電話', value: '02-0000-0000', href: 'tel:+886200000000' }] },
    ],
    pages: [aboutSchool, courseFaq, PAGES.contact()],
  },
];

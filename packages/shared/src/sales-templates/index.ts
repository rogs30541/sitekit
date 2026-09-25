/**
 * 一頁式網頁（銷售頁）套版：五分類 × 5 種風格配色 ＝ 25 套。
 * 骨架來源：airuru.com.tw 課程銷售頁（2026-09-25 實看；只取版面結構，不含任何文案／圖片）——
 *   hero 主張 → 信任帶＋保證 → 痛點卡 → 權威／人物 → 承諾（三結果） → 公式視覺 → 模組卡 ×N（各含「解決：」＋收束句）
 *   → 優惠 → 見證 → 商品／場次區塊（掛商品）→ FAQ → 頁尾。手機優先單欄、常駐底部 CTA。
 * 其他四類依同一敘事骨架反推（換掉區塊語意與順序）。每套＝內文設計文件（DesignDoc）＋主題色＋區塊順序／標題＋通知列／表單預設。
 * 文案一律佔位（不杜撰品牌事實）；圖示用名稱（ICON_NAMES），不用 emoji。
 */
import type { DesignDoc, DesignNode, DesignStyle } from '../design';
import type { SalesPageDoc, SalesSectionKey } from '../sales';
import type { TemplateCategory } from '../site-templates/common';

export interface SalesPalette {
  /** 配色名（風格名） */
  name: string;
  primary: string;
  accent: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  heroFrom: string;
  heroTo: string;
  onPrimary: string;
  border: string;
  radius: string;
  dark: boolean;
}
export interface SalesTemplate {
  id: string;
  category: TemplateCategory;
  name: string;
  style: string;
  tagline: string;
  tags: string[];
  source?: string;
  palette: SalesPalette;
  /** 內文區塊序列（供線框縮圖與說明） */
  blocks: string[];
  /** 產出 SalesPageDoc 的部分（content／theme／sections／notice／contentOptions／display） */
  doc: () => Partial<SalesPageDoc>;
}

/* ---------- 節點工廠 ---------- */
let seq = 0;
const nid = () => `t${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const n = (type: string, props: Record<string, unknown> = {}, base: DesignStyle = {}, children?: DesignNode[]): DesignNode => ({ id: nid(), type, props, style: Object.keys(base).length ? { base } : {}, ...(children ? { children } : {}) });

type Card = { icon: string; title: string; text: string };
const mk = (P: SalesPalette) => {
  const cardStyle: DesignStyle = { padding: '20px', borderRadius: P.radius, background: P.surface, border: `1px solid ${P.border}`, color: P.text };
  const section = (children: DesignNode[], extra: DesignStyle = {}) => n('section', { contentWidth: '720px' }, { padding: '48px 20px', background: P.bg, color: P.text, ...extra }, children);
  const h2 = (text: string, extra: DesignStyle = {}) => n('heading', { level: 2, text }, { fontSize: '28px', fontWeight: '800', lineHeight: '1.25', textAlign: 'center', margin: '0 0 8px', ...extra });
  const sub = (text: string, extra: DesignStyle = {}) => n('text', { text }, { fontSize: '16px', lineHeight: '1.7', textAlign: 'center', color: P.muted, margin: '0 0 24px', ...extra });
  const line = (text: string) => n('text', { text }, { fontSize: '18px', fontWeight: '700', lineHeight: '1.6', textAlign: 'center', margin: '24px 0 0', color: P.primary });
  const cards = (items: Card[], cols = 1) => n('columns', { cols }, { gap: '14px' }, items.map((c) => n('column', {}, {}, [n('iconbox', c, cardStyle)])));
  const btn = (text: string) => n('addtocart', { text, target: '#sk-products' }, { display: 'inline-block', padding: '14px 32px', borderRadius: '999px', fontWeight: '800', fontSize: '16px', background: P.primary, color: P.onPrimary, textAlign: 'center' });
  const center = (children: DesignNode[]) => n('container', {}, { display: 'flex', justifyContent: 'center', gap: '12px', margin: '24px 0 0' }, children);
  // 圖片佔位：用 container＋text（不是空 src 的 image 節點，否則發佈前檢測「圖片沒有網址」會擋）；站主在設計器把它換成圖片區塊
  const image = (alt: string, ratio = '16 / 9') => n('container', {}, { width: '100%', aspectRatio: ratio, borderRadius: P.radius, background: P.surface, border: `1px dashed ${P.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }, [n('text', { text: `＋ 放圖片：${alt}（在設計器換成「圖片」區塊）` }, { fontSize: '13px', color: P.muted, textAlign: 'center', padding: '12px' })]);

  const hero = (kicker: string, title: string, subtitle: string, cta: string) =>
    n('section', { contentWidth: '720px' }, { padding: '72px 20px 56px', background: `linear-gradient(160deg, ${P.heroFrom}, ${P.heroTo})`, color: P.dark ? '#ffffff' : P.text, textAlign: 'center' }, [
      n('text', { text: kicker }, { fontSize: '13px', letterSpacing: '0.2em', fontWeight: '700', textTransform: 'uppercase', color: P.accent, margin: '0 0 12px' }),
      n('heading', { level: 1, text: title }, { fontSize: '40px', fontWeight: '900', lineHeight: '1.15', margin: '0 0 12px' }),
      n('text', { text: subtitle }, { fontSize: '18px', lineHeight: '1.7', opacity: '0.9', margin: '0 0 24px' }),
      center([btn(cta)]),
    ]);
  const trust = (items: string[], guarantee: string) =>
    section(
      [
        n('columns', { cols: items.length }, { gap: '10px' }, items.map((t) => n('column', {}, {}, [n('text', { text: t }, { fontSize: '14px', fontWeight: '700', textAlign: 'center', padding: '10px 8px', borderRadius: P.radius, background: P.surface, border: `1px solid ${P.border}` })]))),
        n('quote', { text: guarantee, cite: '' }, { margin: '16px 0 0', padding: '16px 20px', borderRadius: P.radius, background: P.surface, border: `1px solid ${P.accent}`, color: P.text, textAlign: 'center', fontWeight: '700' }),
      ],
      { padding: '24px 20px' },
    );
  const pain = (title: string, subtitle: string, items: Card[]) => section([h2(title), sub(subtitle), cards(items)]);
  const authority = (title: string, bigNumber: string, numberLabel: string, bio: string, quote: string) =>
    section([
      image('人物／品牌照片', '4 / 3'),
      h2(title, { margin: '24px 0 8px' }),
      n('heading', { level: 3, text: bigNumber }, { fontSize: '44px', fontWeight: '900', textAlign: 'center', color: P.accent, margin: '8px 0 0', lineHeight: '1.1' }),
      sub(numberLabel, { margin: '4px 0 16px' }),
      n('text', { text: bio }, { fontSize: '16px', lineHeight: '1.8', textAlign: 'center' }),
      n('quote', { text: quote, cite: '' }, { margin: '20px 0 0', padding: '16px 20px', borderRadius: P.radius, background: P.surface, border: `1px solid ${P.border}`, textAlign: 'center' }),
    ]);
  const promise = (title: string, items: string[]) => section([h2(title), n('list', { items, ordered: false, icon: 'check' }, { fontSize: '18px', lineHeight: '2', fontWeight: '700', maxWidth: '520px', margin: '0 auto' })]);
  const formula = (parts: string[], result: string) =>
    section([
      n('columns', { cols: parts.length }, { gap: '10px' }, parts.map((t) => n('column', {}, {}, [n('text', { text: t }, { fontSize: '18px', fontWeight: '800', textAlign: 'center', padding: '14px 8px', borderRadius: P.radius, border: `2px solid ${P.accent}`, color: P.accent })]))),
      n('heading', { level: 3, text: `＝ ${result}` }, { fontSize: '26px', fontWeight: '900', textAlign: 'center', margin: '16px 0 0' }),
    ]);
  const moduleBlock = (title: string, solves: string, items: Card[], takeaway: string) => section([h2(title), sub(`解決：${solves}`), cards(items), line(takeaway)]);
  const steps = (title: string, items: Card[]) => section([h2(title), cards(items)]);
  const offer = (title: string, rows: [string, string][], note: string, cta: string) =>
    section([
      h2(title),
      n('columns', { cols: rows.length }, { gap: '12px' }, rows.map(([k, v]) => n('column', {}, {}, [n('text', { text: k }, { fontSize: '14px', textAlign: 'center', color: P.muted }), n('heading', { level: 3, text: v }, { fontSize: '30px', fontWeight: '900', textAlign: 'center', color: P.primary, margin: '4px 0 0' })]))),
      sub(note, { margin: '12px 0 0', fontWeight: '700', color: P.accent }),
      center([btn(cta)]),
    ]);
  const testimonials = (title: string, subtitle: string, quotes: [string, string][]) => section([h2(title), sub(subtitle), n('columns', { cols: 1 }, { gap: '12px' }, quotes.map(([q, c]) => n('column', {}, {}, [n('quote', { text: q, cite: c }, { padding: '16px 20px', borderRadius: P.radius, background: P.surface, border: `1px solid ${P.border}` })])))]);
  const faq = (items: { q: string; a: string }[]) => section([h2('常見問題'), n('faq', { items }, {})]);
  const closing = (title: string, text: string, cta: string) => section([h2(title), sub(text), center([btn(cta)])], { background: P.surface, borderTop: `1px solid ${P.border}` });
  return { hero, trust, pain, authority, promise, formula, moduleBlock, steps, offer, testimonials, faq, closing, section, h2, sub, cards, image, btn, center };
};

const doc = (root: DesignNode[], P: SalesPalette): DesignDoc => ({ version: 1, root: { id: 'root', type: 'root', props: {}, style: {}, children: root }, settings: { maxWidth: 760, accent: P.primary } });

/* ---------- 五分類骨架（文案為佔位） ---------- */
type Blueprint = (P: SalesPalette) => { blocks: string[]; content: DesignDoc; sectionTitles: Partial<Record<'offer' | 'bundle' | 'product' | 'addon', string>>; order: SalesSectionKey[]; notice: string; addToCartButton: boolean };

const COURSE: Blueprint = (P) => {
  const b = mk(P);
  return {
    blocks: ['hero', 'trust', 'pain', 'authority', 'promise', 'formula', 'module', 'module', 'module', 'offer', 'testimonials', 'products', 'faq', 'closing'],
    content: doc(
      [
        b.hero('實體課程', '一句話講清楚這堂課帶來的改變', '副標補一個具體結果或情境，讓人知道學完會不一樣。', '立即報名'),
        b.trust(['業界唯一的獨特之處', '學完可直接套用', '小班實作'], '不滿意保證：在這裡寫退費或補課承諾'),
        b.pain('你卡在哪？', '把學員最常見的 3–5 個卡關寫成卡片', [
          { icon: 'meh', title: '痛點一', text: '一兩句描述症狀與後果。' },
          { icon: 'frown', title: '痛點二', text: '一兩句描述症狀與後果。' },
          { icon: 'clock', title: '痛點三', text: '一兩句描述症狀與後果。' },
          { icon: 'search', title: '痛點四', text: '一兩句描述症狀與後果。' },
        ]),
        b.authority('講師是誰', '關鍵數字', '數字的說明（例：學員人數、實戰年資）', '講師簡介：背景、實戰經歷、為什麼有資格教這件事。', '「一句講師的核心信念。」'),
        b.promise('這堂課只給你一套', ['能複製的做法', '能落地的成果', '能持續運作的系統']),
        b.formula(['變數一', '變數二', '變數三'], '你要的結果'),
        b.moduleBlock('模組一：名稱', '這個模組解決的具體問題', [
          { icon: 'zap', title: '單元 1', text: '學到什麼、產出什麼。' },
          { icon: 'chart-bar', title: '單元 2', text: '學到什麼、產出什麼。' },
          { icon: 'target', title: '單元 3', text: '學到什麼、產出什麼。' },
        ], '一句收束：學完這個模組你能做到什麼。'),
        b.moduleBlock('模組二：名稱', '這個模組解決的具體問題', [
          { icon: 'layers', title: '單元 1', text: '學到什麼、產出什麼。' },
          { icon: 'users', title: '單元 2', text: '學到什麼、產出什麼。' },
          { icon: 'lightbulb', title: '單元 3', text: '學到什麼、產出什麼。' },
        ], '一句收束：學完這個模組你能做到什麼。'),
        b.moduleBlock('模組三：現場實作', '學了一堆方法但不會用', [
          { icon: 'mic', title: '學員當主角', text: '現場挑一位學員案例操作。' },
          { icon: 'pen', title: '現場產出', text: '用模組當場做出成果。' },
          { icon: 'scissors', title: '現場完成', text: '一次處理到可交付。' },
        ], '一句收束：做起來有多簡單，現場示範給你看。'),
        b.offer('報名優惠', [['一位', 'NT$ 0'], ['兩位同行', 'NT$ 0']], '團報／早鳥規則寫在這裡', '選擇場次'),
        b.testimonials('學員怎麼說', '真實學員，真實心得（可換成影片區塊）', [['學員心得一句話。', '學員 A'], ['學員心得一句話。', '學員 B'], ['學員心得一句話。', '學員 C']]),
        b.faq([{ q: '課程時長與地點？', a: '寫在這裡。' }, { q: '可以退費嗎？', a: '寫在這裡。' }, { q: '需要準備什麼？', a: '寫在這裡。' }]),
        b.closing('準備好開始了嗎？', '名額有限，選擇你方便的場次。', '選擇場次報名'),
      ],
      P,
    ),
    sectionTitles: { offer: '選擇場次', product: '其他場次', addon: '加購' },
    order: ['content', 'offer', 'product', 'bundle', 'addon', 'cart', 'contact'],
    notice: '團報優惠：兩人同行享優惠，每 2 人一組可疊加',
    addToCartButton: true,
  };
};

const SHOP: Blueprint = (P) => {
  const b = mk(P);
  return {
    blocks: ['hero', 'trust', 'pain', 'story', 'features', 'steps', 'testimonials', 'offer', 'products', 'faq', 'closing'],
    content: doc(
      [
        b.hero('新品上市', '一句話講清楚這個商品解決什麼', '副標補一個具體數字或情境。', '立即選購'),
        b.trust(['免運門檻', '七天鑑賞', '產地／認證'], '品質保證：在這裡寫保固或退換貨承諾'),
        b.pain('你是不是也遇過', '把顧客最常見的困擾寫成卡片', [
          { icon: 'frown', title: '困擾一', text: '一兩句描述。' },
          { icon: 'clock', title: '困擾二', text: '一兩句描述。' },
          { icon: 'search', title: '困擾三', text: '一兩句描述。' },
        ]),
        b.authority('為什麼是我們', '關鍵數字', '數字的說明（例：銷售數量、年資）', '品牌故事：起點、堅持、與別人不同的地方。', '「一句品牌信念。」'),
        b.moduleBlock('產品特色', '顧客最在意的問題', [
          { icon: 'sparkles', title: '特色一', text: '成分／材質／工法。' },
          { icon: 'shield', title: '特色二', text: '安全／認證／保固。' },
          { icon: 'heart', title: '特色三', text: '體驗／口碑。' },
        ], '一句收束：用了之後的改變。'),
        b.steps('怎麼使用', [
          { icon: 'check-circle', title: '步驟一', text: '一句話。' },
          { icon: 'check-circle', title: '步驟二', text: '一句話。' },
          { icon: 'check-circle', title: '步驟三', text: '一句話。' },
        ]),
        b.testimonials('顧客怎麼說', '真實回饋', [['顧客回饋一句話。', '顧客 A'], ['顧客回饋一句話。', '顧客 B'], ['顧客回饋一句話。', '顧客 C']]),
        b.offer('限時優惠', [['單件', 'NT$ 0'], ['組合價', 'NT$ 0']], '優惠規則／截止時間寫在這裡', '立即選購'),
        b.faq([{ q: '運送方式與時間？', a: '寫在這裡。' }, { q: '可以退換貨嗎？', a: '寫在這裡。' }, { q: '如何保存？', a: '寫在這裡。' }]),
        b.closing('現在就入手', '優惠期間內下單最划算。', '立即選購'),
      ],
      P,
    ),
    sectionTitles: { offer: '限時優惠', bundle: '超值組合', product: '單品', addon: '加購' },
    order: ['content', 'offer', 'bundle', 'product', 'addon', 'cart', 'contact'],
    notice: '全站免運｜七天鑑賞期',
    addToCartButton: true,
  };
};

const IMAGE: Blueprint = (P) => {
  const b = mk(P);
  return {
    blocks: ['hero', 'trust', 'pain', 'solution', 'features', 'cases', 'offer', 'products', 'faq', 'closing'],
    content: doc(
      [
        b.hero('產品／方案', '一句話講清楚這個方案帶來的改變', '副標：給誰、解決什麼、多快見效。', '免費諮詢'),
        b.trust(['服務客戶數', '平均見效時間', '滿意度'], '承諾：在這裡寫服務保證'),
        b.pain('你的團隊是否正面臨', '把決策者最在意的問題寫成卡片', [
          { icon: 'trending-up', title: '問題一', text: '一兩句描述。' },
          { icon: 'clock', title: '問題二', text: '一兩句描述。' },
          { icon: 'users', title: '問題三', text: '一兩句描述。' },
        ]),
        b.promise('我們的解法', ['一句話說明做法一', '一句話說明做法二', '一句話說明做法三']),
        b.moduleBlock('方案內容', '導入後要解決的核心問題', [
          { icon: 'layers', title: '功能一', text: '做什麼、帶來什麼。' },
          { icon: 'settings', title: '功能二', text: '做什麼、帶來什麼。' },
          { icon: 'chart-bar', title: '功能三', text: '做什麼、帶來什麼。' },
          { icon: 'shield', title: '功能四', text: '做什麼、帶來什麼。' },
        ], '一句收束：導入後的整體改變。'),
        b.testimonials('客戶案例', '產業、情境、成果', [['案例一句話成果。', '客戶 A・產業'], ['案例一句話成果。', '客戶 B・產業']]),
        b.offer('方案價格', [['基本', 'NT$ 0'], ['進階', 'NT$ 0'], ['企業', '洽詢']], '含什麼、不含什麼寫在這裡', '選擇方案'),
        b.faq([{ q: '導入需要多久？', a: '寫在這裡。' }, { q: '有試用嗎？', a: '寫在這裡。' }, { q: '如何計費？', a: '寫在這裡。' }]),
        b.closing('想進一步了解？', '留下需求，我們一個工作天內回覆。', '免費諮詢'),
      ],
      P,
    ),
    sectionTitles: { offer: '方案', product: '其他服務', addon: '加購' },
    order: ['content', 'offer', 'product', 'bundle', 'addon', 'cart', 'contact'],
    notice: '',
    addToCartButton: true,
  };
};

const BRAND: Blueprint = (P) => {
  const b = mk(P);
  return {
    blocks: ['hero', 'about', 'promise', 'contents', 'testimonials', 'offer', 'products', 'faq', 'closing'],
    content: doc(
      [
        b.hero('個人品牌', '一句話說你能幫誰做到什麼', '副標：你的定位與這次推出的內容。', '立即加入'),
        b.authority('關於我', '關鍵數字', '數字的說明（例：追蹤人數、服務年資）', '自我介紹：經歷、專長、為什麼做這件事。', '「一句個人信念。」'),
        b.promise('加入後你會得到', ['得到一', '得到二', '得到三']),
        b.moduleBlock('內容單元', '你最想解決的那件事', [
          { icon: 'book', title: '單元一', text: '內容與產出。' },
          { icon: 'video', title: '單元二', text: '內容與產出。' },
          { icon: 'users', title: '單元三', text: '內容與產出。' },
        ], '一句收束。'),
        b.testimonials('他們怎麼說', '學員／客戶回饋', [['回饋一句話。', 'A'], ['回饋一句話。', 'B'], ['回饋一句話。', 'C']]),
        b.offer('方案', [['單月', 'NT$ 0'], ['年費', 'NT$ 0']], '早鳥／限量規則寫在這裡', '立即加入'),
        b.faq([{ q: '適合誰？', a: '寫在這裡。' }, { q: '怎麼參與？', a: '寫在這裡。' }, { q: '可以退費嗎？', a: '寫在這裡。' }]),
        b.closing('一起開始', '名額有限，現在加入。', '立即加入'),
      ],
      P,
    ),
    sectionTitles: { offer: '方案', product: '單品', addon: '加購' },
    order: ['content', 'offer', 'product', 'bundle', 'addon', 'cart', 'contact'],
    notice: '',
    addToCartButton: true,
  };
};

const SERVICE: Blueprint = (P) => {
  const b = mk(P);
  return {
    blocks: ['hero', 'trust', 'pain', 'steps', 'services', 'authority', 'testimonials', 'offer', 'products', 'faq', 'closing'],
    content: doc(
      [
        b.hero('專業服務', '一句話講清楚你解決什麼問題', '副標：服務對象、流程與承諾。', '預約諮詢'),
        b.trust(['服務年資', '案件數', '回覆時間'], '承諾：在這裡寫服務保證（例：不收隱藏費用）'),
        b.pain('常見的困擾', '客戶最常來找你的原因', [
          { icon: 'frown', title: '困擾一', text: '一兩句描述。' },
          { icon: 'clock', title: '困擾二', text: '一兩句描述。' },
          { icon: 'search', title: '困擾三', text: '一兩句描述。' },
        ]),
        b.steps('服務流程', [
          { icon: 'check-circle', title: '1. 諮詢', text: '一句話。' },
          { icon: 'check-circle', title: '2. 評估', text: '一句話。' },
          { icon: 'check-circle', title: '3. 執行', text: '一句話。' },
          { icon: 'check-circle', title: '4. 追蹤', text: '一句話。' },
        ]),
        b.moduleBlock('服務項目', '客戶最在意的事', [
          { icon: 'briefcase', title: '項目一', text: '內容與範圍。' },
          { icon: 'file-text', title: '項目二', text: '內容與範圍。' },
          { icon: 'shield', title: '項目三', text: '內容與範圍。' },
        ], '一句收束。'),
        b.authority('專業背景', '關鍵數字', '數字的說明', '資歷、證照、專長領域。', '「一句專業信念。」'),
        b.testimonials('客戶怎麼說', '真實回饋', [['回饋一句話。', '客戶 A'], ['回饋一句話。', '客戶 B']]),
        b.offer('方案與費用', [['初次諮詢', 'NT$ 0'], ['專案', '洽詢']], '含什麼、不含什麼寫在這裡', '預約諮詢'),
        b.faq([{ q: '需要準備什麼？', a: '寫在這裡。' }, { q: '費用怎麼算？', a: '寫在這裡。' }, { q: '多久有結果？', a: '寫在這裡。' }]),
        b.closing('預約你的時段', '留下需求，我們會盡快聯絡。', '預約諮詢'),
      ],
      P,
    ),
    sectionTitles: { offer: '預約方案', product: '其他服務', addon: '加購' },
    order: ['content', 'offer', 'product', 'bundle', 'addon', 'cart', 'contact'],
    notice: '',
    addToCartButton: true,
  };
};

/* ---------- 五種風格配色 × 五分類 ---------- */
const pal = (name: string, p: Omit<SalesPalette, 'name'>): SalesPalette => ({ name, ...p });
const light = (name: string, primary: string, accent: string, bg = '#ffffff', surface = '#f7f7f8', heroFrom?: string, heroTo?: string, radius = '14px'): SalesPalette =>
  pal(name, { primary, accent, bg, surface, text: '#171717', muted: '#6b7280', heroFrom: heroFrom ?? surface, heroTo: heroTo ?? bg, onPrimary: '#ffffff', border: '#e5e7eb', radius, dark: false });
const darkP = (name: string, primary: string, accent: string, bg: string, surface: string, heroFrom: string, heroTo: string, radius = '14px'): SalesPalette =>
  pal(name, { primary, accent, bg, surface, text: '#f3f4f6', muted: '#a1a1aa', heroFrom, heroTo, onPrimary: '#ffffff', border: '#2a2a33', radius, dark: true });

const PALETTES: Record<TemplateCategory, SalesPalette[]> = {
  course: [
    darkP('霓虹爆款', '#ff2d55', '#2de2e6', '#0b0b12', '#15151f', '#1a0b2e', '#0b2a33', '16px'),
    light('學院沉穩', '#1e3a8a', '#c9a227', '#ffffff', '#f4f6fb', '#1e3a8a', '#0f172a'),
    light('清新知識', '#0f766e', '#f59e0b', '#ffffff', '#ecfdf5', '#d1fae5', '#ffffff', '18px'),
    light('暖陽陪跑', '#ea580c', '#0f766e', '#fffaf3', '#fff1e6', '#ffedd5', '#fffaf3', '20px'),
    light('極簡黑白', '#111111', '#111111', '#ffffff', '#f5f5f5', '#111111', '#333333', '6px'),
  ],
  shop: [
    light('純淨自然', '#3f6212', '#d97706', '#fffdf7', '#f4f7ee', '#e8f0d8', '#fffdf7', '18px'),
    darkP('質感黑金', '#c9a227', '#c9a227', '#0f0f0f', '#1a1a1a', '#1a1a1a', '#000000', '8px'),
    light('活力橘紅', '#ef4444', '#f59e0b', '#ffffff', '#fff5f5', '#fee2e2', '#ffffff', '999px'),
    light('柔和粉彩', '#db2777', '#7c3aed', '#fffafc', '#fdf2f8', '#fce7f3', '#fffafc', '22px'),
    light('海洋清爽', '#0369a1', '#06b6d4', '#ffffff', '#f0f9ff', '#e0f2fe', '#ffffff', '14px'),
  ],
  image: [
    light('企業藍', '#1d4ed8', '#0ea5e9', '#ffffff', '#f5f7fb', '#1e3a8a', '#1d4ed8', '10px'),
    darkP('科技深黑', '#6366f1', '#22d3ee', '#0a0a0f', '#141420', '#0a0a0f', '#1e1b4b', '12px'),
    light('信任綠', '#047857', '#10b981', '#ffffff', '#f0fdf4', '#d1fae5', '#ffffff', '12px'),
    light('溫暖米灰', '#7c2d12', '#b45309', '#faf7f2', '#f3efe7', '#efe7dc', '#faf7f2', '12px'),
    light('銳利紅黑', '#dc2626', '#111111', '#ffffff', '#f5f5f5', '#111111', '#dc2626', '4px'),
  ],
  brand: [
    light('親和奶油', '#b45309', '#0f766e', '#fffbf5', '#fff4e5', '#ffedd5', '#fffbf5', '20px'),
    darkP('夜色創作者', '#f472b6', '#a78bfa', '#0f0f14', '#1a1a22', '#2e1065', '#0f0f14', '16px'),
    light('森林綠', '#166534', '#65a30d', '#ffffff', '#f3faf3', '#dcfce7', '#ffffff', '16px'),
    light('雜誌黑白', '#111111', '#e11d48', '#ffffff', '#f5f5f5', '#ffffff', '#f5f5f5', '0px'),
    light('薰衣草', '#6d28d9', '#ec4899', '#fdfcff', '#f5f3ff', '#ede9fe', '#fdfcff', '18px'),
  ],
  service: [
    light('正式深藍', '#1e3a8a', '#b45309', '#ffffff', '#f4f6fb', '#0f172a', '#1e3a8a', '8px'),
    light('溫潤木質', '#78350f', '#0f766e', '#fffaf3', '#f5ecdf', '#ede0cc', '#fffaf3', '12px'),
    light('醫療潔淨', '#0e7490', '#0ea5e9', '#ffffff', '#f0fdfa', '#ccfbf1', '#ffffff', '14px'),
    darkP('顧問墨黑', '#e5e7eb', '#c9a227', '#111111', '#1c1c1c', '#111111', '#262626', '6px'),
    light('活力橙', '#ea580c', '#1d4ed8', '#ffffff', '#fff7ed', '#ffedd5', '#ffffff', '999px'),
  ],
};
const BLUEPRINTS: Record<TemplateCategory, Blueprint> = { course: COURSE, shop: SHOP, image: IMAGE, brand: BRAND, service: SERVICE };
const NAMES: Record<TemplateCategory, [string, string]> = { course: ['課程報名頁', '實體／線上課程、工作坊'], shop: ['商品銷售頁', '單品／組合、限時優惠'], image: ['方案登陸頁', '產品／方案、B2B 諮詢'], brand: ['個人品牌頁', '會員／內容方案、活動'], service: ['服務預約頁', '事務所／診所／顧問預約'] };
const SLUG: Record<string, string> = { 霓虹爆款: 'neon', 學院沉穩: 'academy', 清新知識: 'fresh', 暖陽陪跑: 'warm', 極簡黑白: 'mono', 純淨自然: 'natural', 質感黑金: 'gold', 活力橘紅: 'vivid', 柔和粉彩: 'pastel', 海洋清爽: 'ocean', 企業藍: 'corporate', 科技深黑: 'tech', 信任綠: 'trust', 溫暖米灰: 'beige', 銳利紅黑: 'sharp', 親和奶油: 'cream', 夜色創作者: 'night', 森林綠: 'forest', 雜誌黑白: 'magazine', 薰衣草: 'lavender', 正式深藍: 'navy', 溫潤木質: 'wood', 醫療潔淨: 'clinic', 顧問墨黑: 'ink', 活力橙: 'orange' };

function make(category: TemplateCategory, P: SalesPalette): SalesTemplate {
  const bp = BLUEPRINTS[category](P);
  return {
    id: `sales-${category}-${SLUG[P.name] ?? P.name}`,
    category,
    name: `${NAMES[category][0]}・${P.name}`,
    style: P.name,
    tagline: `${NAMES[category][1]}；${bp.blocks.length} 段敘事：${bp.blocks.join(' → ')}`,
    tags: [NAMES[category][0], P.name, P.dark ? '深色' : '淺色'],
    source: category === 'course' && P.name === '霓虹爆款' ? 'airuru.com.tw 課程銷售頁骨架（2026-09-25 實看：hero→信任帶→痛點→權威→承諾→公式→模組×N→優惠→見證→場次→頁尾）' : `依課程頁骨架反推的${NAMES[category][0]}結構`,
    palette: P,
    blocks: bp.blocks,
    doc: () => {
      const b = BLUEPRINTS[category](P);
      // 每一段都掛滑動追蹤：sp_<區塊>（重複的加序號），區塊自身可見 50% 即送一次
      const seen: Record<string, number> = {};
      const contentBlocks = b.blocks.filter((x) => x !== 'products'); // products 由銷售頁商品區塊渲染，不在內文
      b.content.root.children?.forEach((node, i) => {
        const key = contentBlocks[i] ?? node.type;
        seen[key] = (seen[key] ?? 0) + 1;
        const name = seen[key] > 1 ? `${key}_${seen[key]}` : key;
        node.track = { event: `sp_${name}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40), percent: 50, once: true, label: name };
      });
      return {
        content: b.content,
        contentOptions: { addToCartButton: b.addToCartButton, funnelTracking: true },
        theme: { primaryColor: P.primary, background: { type: 'color', value: P.bg }, maxWidth: 760, topPadding: 0, customCss: `body{background:${P.bg}}` },
        display: { columnsDesktop: 1, columnsMobile: 1, buttonStyle: P.radius === '999px' || P.radius === '20px' || P.radius === '22px' ? 'pill' : P.radius === '0px' || P.radius === '4px' || P.radius === '6px' ? 'square' : 'soft', quantityMode: 'buttons', showStock: 'low', showSold: 'never', imageRatio: 'square-crop' },
        sections: { order: b.order, titles: { offer: b.sectionTitles.offer ?? '優惠折扣', bundle: b.sectionTitles.bundle ?? '熱銷組合', product: b.sectionTitles.product ?? '精選單品', addon: b.sectionTitles.addon ?? '加價購' }, enabled: { offer: true, bundle: true, product: true, addon: true } },
        notice: { enabled: !!b.notice, text: b.notice },
        contact: { line: '', facebook: '', telegram: '', email: '', phone: '', display: 'collapsed' },
        tracking: { scroll: { enabled: true, percents: [25, 50, 75, 100], event: 'scroll_depth' } } as SalesPageDoc['tracking'],
      };
    },
  };
}

export const SALES_TEMPLATES: SalesTemplate[] = (Object.keys(BLUEPRINTS) as TemplateCategory[]).flatMap((c) => PALETTES[c].map((P) => make(c, P)));
export const getSalesTemplate = (id: string) => SALES_TEMPLATES.find((t) => t.id === id);
export const listSalesTemplates = (category?: TemplateCategory) =>
  SALES_TEMPLATES.filter((t) => !category || t.category === category).map(({ id, category, name, style, tagline, tags, source, palette, blocks }) => ({ id, category, name, style, tagline, tags, source, palette, blocks }));
export type SalesTemplateSummary = ReturnType<typeof listSalesTemplates>[number];

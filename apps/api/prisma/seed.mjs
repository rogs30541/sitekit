// 種子資料：初始管理員、系統設定、一篇示範文章、一門示範課程。可重複執行（upsert）。
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';
const isProd = process.env.APP_ENV === 'production';

async function main() {
  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      displayName: 'Site Admin',
      passwordHash: await bcrypt.hash(password, 10),
      role: 'superadmin',
      allowedFeatures: ['shop', 'courses', 'studio', 'credits', 'storage', 'byok'],
    },
  });

  const settings = [
    ['brand.name', 'AIGC創客', false],
    ['brand.siteName', 'AIGC創客架站套件', false],
    ['storage.driver', 'local', false],
    // 非 production 預設用本機假閘道；正式環境改 newebpay 並填入商店參數
    ['payment.provider', isProd ? 'none' : 'mock', false],
    ['ezpay.enabled', 'false', false],
    ['ai.provider', isProd ? 'openai' : 'mock', false],
    ['seo.noindex', 'false', false],
  ];
  for (const [key, value, isSecret] of settings) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value, isSecret } });
  }

  await prisma.content.upsert({
    where: { source_externalId: { source: 'seed', externalId: 'welcome' } },
    update: {},
    create: {
      source: 'seed',
      externalId: 'welcome',
      type: 'post',
      title: '歡迎使用 SiteKit',
      slug: 'welcome',
      excerpt: '這是種子資料建立的示範文章，確認部落格與 SEO 管線正常。',
      body: '<p>這是種子資料建立的示範文章。你可以在後台用「內容匯入」把 WordPress 或 CSV 的文章原生搬進來，舊網址會自動產生 301 導向。</p>',
      author: 'SiteKit',
      tags: ['announcement'],
      status: 'published',
      publishedAt: new Date(),
      canonicalUrl: '/blog/welcome',
    },
  });

  await prisma.product.upsert({
    where: { sku: 'DEMO-MUG' },
    update: {},
    create: { sku: 'DEMO-MUG', type: 'physical', name: '示範馬克杯', description: '用來驗證購物車、庫存、運費與物流流程的示範實體商品。', price: 350, stock: 20 },
  });
  await prisma.coupon.upsert({ where: { code: 'WELCOME10' }, update: {}, create: { code: 'WELCOME10', type: 'percent', value: 10, minAmount: 300, note: '示範折扣碼' } });
  await prisma.setting.upsert({ where: { key: 'shipping.fee' }, update: {}, create: { key: 'shipping.fee', value: '80', isSecret: false } });
  await prisma.setting.upsert({ where: { key: 'shipping.freeOver' }, update: {}, create: { key: 'shipping.freeOver', value: '1000', isSecret: false } });
  const product = await prisma.product.upsert({
    where: { sku: 'COURSE-DEMO' },
    update: {},
    create: { type: 'course', sku: 'COURSE-DEMO', name: '示範課程：SiteKit 上手', description: '兩章示範課程，第一章可免費試看。', price: 990 },
  });
  const course = await prisma.course.upsert({
    where: { productId: product.id },
    update: {},
    create: { productId: product.id, slug: 'demo-course', summary: '用來驗證購買、授權與播放流程的示範課程。', isPublished: true },
  });
  const chapters = [
    { order: 1, title: '第一章：課程介紹（免費試看）', isPreview: true, durationSec: 300, videoProvider: 'youtube' },
    { order: 2, title: '第二章：正式內容', isPreview: false, durationSec: 1200, videoProvider: 'youtube' },
  ];
  for (const ch of chapters) {
    const exists = await prisma.chapter.findFirst({ where: { courseId: course.id, title: ch.title } });
    if (!exists) await prisma.chapter.create({ data: { courseId: course.id, ...ch } });
  }

  const templates = [
    { key: 'product_white_bg', name: '商品白底圖', category: 'ecommerce', description: '適合電商、直播銷售與商品主圖。', systemPrompt: 'Studio product photo on a clean white background, centered, soft studio lighting, high detail, no text.', inputFields: [{ key: 'productName', label: '商品名稱', type: 'text', required: true, placeholder: '例：霧面不鏽鋼保溫杯' }, { key: 'sellingPoints', label: '商品賣點', type: 'textarea', required: false, placeholder: '例：保冰 24 小時、杯身霧面' }], costPoints: 5, highCostPoints: 15, sortOrder: 10 },
    { key: 'social_post', name: '社群情境貼文', category: 'social', description: 'IG、FB 風格的商品情境貼文圖。', systemPrompt: 'Lifestyle social media photo, natural light, warm tone, product in a real-life scene, square composition, no text overlay.', inputFields: [{ key: 'productName', label: '商品名稱', type: 'text', required: true }, { key: 'scene', label: '使用情境', type: 'textarea', required: true, placeholder: '例：健身後、辦公室下午茶' }], costPoints: 5, highCostPoints: 15, sortOrder: 20 },
  ];
  for (const t of templates) await prisma.aiTemplate.upsert({ where: { key: t.key }, update: {}, create: t });
  const bal = await prisma.user.findUnique({ where: { id: admin.id }, select: { creditBalance: true } });
  if (bal.creditBalance === 0) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: admin.id }, data: { creditBalance: { increment: 100 } } }),
      prisma.creditLedger.create({ data: { userId: admin.id, type: 'grant', amount: 100, balanceAfter: 100, reason: '種子贈點', createdBy: 'seed' } }),
    ]);
  }

  console.log(`[seed] admin ${admin.email} (role ${admin.role}); settings ${settings.length}; post /blog/welcome; course /course/${course.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

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
    ['brand.name', 'SiteKit', false],
    ['brand.siteName', 'SiteKit 架站套件', false],
    ['storage.driver', 'local', false],
    // 非 production 預設用本機假閘道；正式環境改 newebpay 並填入商店參數
    ['payment.provider', isProd ? 'none' : 'mock', false],
    ['ezpay.enabled', 'false', false],
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
    await prisma.chapter.upsert({ where: { courseId_order: { courseId: course.id, order: ch.order } }, update: {}, create: { courseId: course.id, ...ch } });
  }

  console.log(`[seed] admin ${admin.email} (role ${admin.role}); settings ${settings.length}; post /blog/welcome; course /course/${course.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

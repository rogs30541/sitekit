// 種子邏輯（可被 seed.mjs 與單體殼 apps/server 重用）：
// - baseline：系統設定預設值、產圖模板庫（image-templates.json）——每次啟動可安全重跑（只補缺的）
// - demo：示範管理員 admin@example.com／admin12345、示範會員、示範文章／商品／課程／折扣碼（本機開發與 CI 用）
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const here = dirname(fileURLToPath(import.meta.url));

export async function seedBaseline(prisma, { isProd = process.env.APP_ENV === 'production' } = {}) {
  const settings = [
    ['storage.driver', 'local', false],
    ['payment.provider', isProd ? 'none' : 'mock', false],
    ['ezpay.enabled', 'false', false],
    ['ai.provider', isProd ? '' : 'mock', false],
    ['seo.noindex', 'false', false],
  ];
  for (const [key, value, isSecret] of settings) await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value, isSecret } });
  const templates = JSON.parse(readFileSync(resolve(here, 'image-templates.json'), 'utf8'));
  let created = 0;
  for (const t of templates) {
    const exists = await prisma.aiTemplate.findUnique({ where: { key: t.key } });
    if (exists) continue;
    await prisma.aiTemplate.create({ data: { ...t, costPoints: 0, highCostPoints: 0, isActive: t.isActive ?? true } });
    created++;
  }
  return { settings: settings.length, templatesCreated: created, templatesTotal: templates.length };
}

export async function seedDemo(prisma) {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';
  const member = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, displayName: 'Site Admin', passwordHash: await bcrypt.hash(password, 10), role: 'user', allowedFeatures: ['shop', 'courses', 'studio', 'credits', 'storage', 'byok'] },
  });
  await prisma.adminUser.upsert({ where: { email }, update: {}, create: { email, passwordHash: await bcrypt.hash(password, 10), displayName: 'Site Admin', role: 'superadmin' } });
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
  await prisma.product.upsert({ where: { sku: 'DEMO-MUG' }, update: {}, create: { sku: 'DEMO-MUG', type: 'physical', name: '示範馬克杯', description: '用來驗證購物車、庫存、運費與物流流程的示範實體商品。', price: 350, stock: 20 } });
  await prisma.coupon.upsert({ where: { code: 'WELCOME10' }, update: {}, create: { code: 'WELCOME10', type: 'percent', value: 10, minAmount: 300, note: '示範折扣碼' } });
  await prisma.setting.upsert({ where: { key: 'shipping.fee' }, update: {}, create: { key: 'shipping.fee', value: '80', isSecret: false } });
  await prisma.setting.upsert({ where: { key: 'shipping.freeOver' }, update: {}, create: { key: 'shipping.freeOver', value: '1000', isSecret: false } });
  const product = await prisma.product.upsert({ where: { sku: 'COURSE-DEMO' }, update: {}, create: { type: 'course', sku: 'COURSE-DEMO', name: '示範課程：SiteKit 上手', description: '兩章示範課程，第一章可免費試看。', price: 990 } });
  const course = await prisma.course.upsert({ where: { productId: product.id }, update: {}, create: { productId: product.id, slug: 'demo-course', summary: '用來驗證購買、授權與播放流程的示範課程。', isPublished: true } });
  for (const ch of [
    { order: 1, title: '第一章：課程介紹（免費試看）', isPreview: true, durationSec: 300, videoProvider: 'youtube' },
    { order: 2, title: '第二章：正式內容', isPreview: false, durationSec: 1200, videoProvider: 'youtube' },
  ]) {
    const exists = await prisma.chapter.findFirst({ where: { courseId: course.id, title: ch.title } });
    if (!exists) await prisma.chapter.create({ data: { courseId: course.id, ...ch } });
  }
  const bal = await prisma.user.findUnique({ where: { id: member.id }, select: { creditBalance: true } });
  if (bal.creditBalance === 0) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: member.id }, data: { creditBalance: { increment: 100 } } }),
      prisma.creditLedger.create({ data: { userId: member.id, type: 'grant', amount: 100, balanceAfter: 100, reason: '種子贈點', createdBy: 'seed' } }),
    ]);
  }
  return { admin: email, course: course.slug };
}

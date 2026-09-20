// 種子資料：初始管理員、系統設定、一篇示範文章。可重複執行（upsert）。
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';

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
    ['payment.provider', 'none', false],
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

  console.log(`[seed] admin ${admin.email} (role ${admin.role}); settings ${settings.length}; sample post /blog/welcome`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

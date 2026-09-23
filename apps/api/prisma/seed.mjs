// 種子資料（可重複執行，upsert）：
// - 一律：系統設定預設值、產圖模板庫（image-templates.json）
// - SEED_DEMO=1：示範管理員 admin@example.com／admin12345、示範會員、示範文章／商品／課程／折扣碼（本機開發與 CI 用；正式部署不要帶）
// 品牌名稱不再由種子寫入：全新站台由安裝精靈（/setup）填，未填則用 packages/shared 的中性預設。
import { createPrisma } from '@sitekit/db';
import { seedBaseline, seedDemo } from './seed-lib.mjs';

const prisma = createPrisma();
const demo = process.env.SEED_DEMO === '1';

async function main() {
  const b = await seedBaseline(prisma);
  console.log(`[seed] settings ${b.settings}；產圖模板 +${b.templatesCreated}（共 ${b.templatesTotal}）`);
  if (demo) {
    const d = await seedDemo(prisma);
    console.log(`[seed] DEMO：管理員／會員 ${d.admin}（admin12345）、文章 /blog/welcome、商品 DEMO-MUG、課程 /course/${d.course}`);
  } else {
    console.log('[seed] 未帶 SEED_DEMO=1：不建立示範帳號與示範內容；全新站台請開 /setup 建立第一位管理員');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

-- DropIndex
DROP INDEX "menu_items_parentId_order_idx";

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "location" TEXT NOT NULL DEFAULT 'header';

-- CreateIndex
CREATE INDEX "menu_items_location_parentId_order_idx" ON "menu_items"("location", "parentId", "order");


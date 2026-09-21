-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'route',
    "contentId" TEXT,
    "href" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "newTab" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_items_parentId_order_idx" ON "menu_items"("parentId", "order");

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "contents"("id") ON DELETE SET NULL ON UPDATE CASCADE;


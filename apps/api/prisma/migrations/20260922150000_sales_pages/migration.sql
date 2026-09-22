-- CreateTable
CREATE TABLE "sales_pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT 'SP',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "draft" JSONB NOT NULL,
    "live" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_page_revisions" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_page_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_pages_slug_key" ON "sales_pages"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "sales_page_revisions_pageId_version_key" ON "sales_page_revisions"("pageId", "version");

-- AddForeignKey
ALTER TABLE "sales_page_revisions" ADD CONSTRAINT "sales_page_revisions_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "sales_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;


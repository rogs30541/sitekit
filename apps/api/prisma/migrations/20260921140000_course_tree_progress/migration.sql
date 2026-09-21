-- DropIndex
DROP INDEX "chapters_courseId_order_key";

-- AlterTable
ALTER TABLE "chapters" ADD COLUMN     "body" TEXT,
ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "accessDays" INTEGER,
ADD COLUMN     "accessMode" TEXT NOT NULL DEFAULT 'unlimited',
ADD COLUMN     "accessUntil" TIMESTAMP(3),
ADD COLUMN     "coverVideoId" TEXT,
ADD COLUMN     "coverVideoProvider" TEXT,
ADD COLUMN     "previewVideoId" TEXT,
ADD COLUMN     "previewVideoProvider" TEXT;

-- CreateTable
CREATE TABLE "chapter_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "positionSec" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapter_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chapter_progress_userId_chapterId_key" ON "chapter_progress"("userId", "chapterId");

-- CreateIndex
CREATE INDEX "chapters_courseId_parentId_order_idx" ON "chapters"("courseId", "parentId", "order");

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_progress" ADD CONSTRAINT "chapter_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_progress" ADD CONSTRAINT "chapter_progress_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;


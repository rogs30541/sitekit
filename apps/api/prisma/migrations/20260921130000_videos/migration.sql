-- AlterTable
ALTER TABLE "chapters" ADD COLUMN     "videoProvider" TEXT NOT NULL DEFAULT 'youtube';

-- CreateTable
CREATE TABLE "video_assets" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "author" TEXT,
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_assets_provider_externalId_key" ON "video_assets"("provider", "externalId");


-- AlterTable
ALTER TABLE "ai_jobs" ADD COLUMN     "byok" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "costPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "inputs" JSONB,
ADD COLUMN     "prompt" TEXT NOT NULL,
ADD COLUMN     "quality" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN     "size" TEXT NOT NULL DEFAULT '1024x1024',
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "templateId" TEXT,
ALTER COLUMN "kind" SET DEFAULT 'image';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "creditBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "creditReserved" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ai_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "coverUrl" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "inputFields" JSONB NOT NULL DEFAULT '[]',
    "defaultSize" TEXT NOT NULL DEFAULT '1024x1024',
    "costPoints" INTEGER NOT NULL DEFAULT 5,
    "highCostPoints" INTEGER NOT NULL DEFAULT 15,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "encrypted" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_templates_key_key" ON "ai_templates"("key");

-- CreateIndex
CREATE UNIQUE INDEX "user_api_keys_userId_provider_key" ON "user_api_keys"("userId", "provider");

-- CreateIndex
CREATE INDEX "ai_jobs_userId_createdAt_idx" ON "ai_jobs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_jobs_status_idx" ON "ai_jobs"("status");

-- AddForeignKey
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ai_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "admin_ai_conversations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "turns" TEXT NOT NULL,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "admin_ai_conversations_adminId_updatedAt_idx" ON "admin_ai_conversations"("adminId", "updatedAt");

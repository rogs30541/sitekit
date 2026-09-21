-- CreateTable
CREATE TABLE "admin_verifications" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_verifications_email_idx" ON "admin_verifications"("email");


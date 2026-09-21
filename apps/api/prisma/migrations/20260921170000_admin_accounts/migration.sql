-- 後台管理員與前台會員分離：新增 admin_users／admin_sessions，既有 admin/superadmin 會員複製為管理員，會員角色一律降為 user
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "Role" NOT NULL DEFAULT 'admin',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_sessions_adminId_idx" ON "admin_sessions"("adminId");
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "admin_users" ("id", "email", "passwordHash", "displayName", "role", "status", "createdAt", "updatedAt")
SELECT 'adm_' || "id", "email", "passwordHash", "displayName", "role", "status", "createdAt", CURRENT_TIMESTAMP
FROM "users" WHERE "role" IN ('admin', 'superadmin') AND "passwordHash" IS NOT NULL;

UPDATE "users" SET "role" = 'user' WHERE "role" <> 'user';

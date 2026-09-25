-- 由 packages/db/sqlite/migrations/20260925193207_contact_reply 產生（node apps/worker/scripts/sync-migrations.mjs），勿手改
-- AlterTable
ALTER TABLE "contact_messages" ADD COLUMN "reply" TEXT;

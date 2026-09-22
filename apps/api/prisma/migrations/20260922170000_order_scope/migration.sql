-- AlterTable
ALTER TABLE "coupons" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'shop';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'shop';


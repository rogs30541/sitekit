-- AlterTable
ALTER TABLE "courses" ADD COLUMN     "buttonText" TEXT,
ADD COLUMN     "instructorBio" TEXT,
ADD COLUMN     "instructorName" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "purchaseNote" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "saleEndsAt" TIMESTAMP(3),
ADD COLUMN     "salePrice" INTEGER,
ADD COLUMN     "saleStartsAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];


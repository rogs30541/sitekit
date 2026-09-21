-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "invalidAt" TIMESTAMP(3),
ADD COLUMN     "invoiceDate" TEXT,
ADD COLUMN     "randomCode" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cvsStoreAddress" TEXT,
ADD COLUMN     "cvsStoreId" TEXT,
ADD COLUMN     "cvsStoreName" TEXT,
ADD COLUMN     "invoiceCarrierNum" TEXT,
ADD COLUMN     "invoiceLoveCode" TEXT,
ADD COLUMN     "invoiceTaxId" TEXT,
ADD COLUMN     "invoiceTitle" TEXT,
ADD COLUMN     "invoiceType" TEXT,
ADD COLUMN     "logisticsId" TEXT,
ADD COLUMN     "logisticsPaymentNo" TEXT,
ADD COLUMN     "logisticsStatus" TEXT,
ADD COLUMN     "logisticsValidationNo" TEXT,
ADD COLUMN     "shippingMethod" TEXT;


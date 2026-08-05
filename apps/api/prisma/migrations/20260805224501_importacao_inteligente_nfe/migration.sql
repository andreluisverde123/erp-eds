-- CreateEnum
CREATE TYPE "FiscalImportResult" AS ENUM ('IMPORTED', 'SKIPPED', 'CANCELLED', 'FAILED');

-- AlterTable
ALTER TABLE "InboundInvoice" ADD COLUMN     "additionalInfo" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cofinsAmount" DECIMAL(14,2),
ADD COLUMN     "discountAmount" DECIMAL(14,2),
ADD COLUMN     "freightAmount" DECIMAL(14,2),
ADD COLUMN     "hasFullDocument" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "icmsAmount" DECIMAL(14,2),
ADD COLUMN     "ipiAmount" DECIMAL(14,2),
ADD COLUMN     "pisAmount" DECIMAL(14,2),
ADD COLUMN     "productsAmount" DECIMAL(14,2),
ADD COLUMN     "protocolNumber" TEXT,
ADD COLUMN     "supplierAddress" TEXT,
ADD COLUMN     "supplierCity" TEXT,
ADD COLUMN     "supplierIe" TEXT,
ADD COLUMN     "supplierState" VARCHAR(2),
ADD COLUMN     "supplierTradeName" TEXT,
ADD COLUMN     "supplierZipCode" VARCHAR(8);

-- AlterTable
ALTER TABLE "InboundInvoiceItem" ADD COLUMN     "cfop" VARCHAR(4),
ADD COLUMN     "code" TEXT,
ADD COLUMN     "cst" VARCHAR(3),
ADD COLUMN     "itemNumber" INTEGER,
ADD COLUMN     "ncm" VARCHAR(8);

-- CreateTable
CREATE TABLE "FiscalImportLog" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "fiscalDocumentId" UUID NOT NULL,
    "sourceSchema" TEXT NOT NULL,
    "sourceNsu" VARCHAR(15) NOT NULL,
    "result" "FiscalImportResult" NOT NULL,
    "itemsCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "inboundInvoiceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FiscalImportLog_companyId_createdAt_idx" ON "FiscalImportLog"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "FiscalImportLog_result_idx" ON "FiscalImportLog"("result");

-- CreateIndex
CREATE INDEX "FiscalImportLog_fiscalDocumentId_idx" ON "FiscalImportLog"("fiscalDocumentId");

-- AddForeignKey
ALTER TABLE "FiscalImportLog" ADD CONSTRAINT "FiscalImportLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalImportLog" ADD CONSTRAINT "FiscalImportLog_fiscalDocumentId_fkey" FOREIGN KEY ("fiscalDocumentId") REFERENCES "FiscalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalImportLog" ADD CONSTRAINT "FiscalImportLog_inboundInvoiceId_fkey" FOREIGN KEY ("inboundInvoiceId") REFERENCES "InboundInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

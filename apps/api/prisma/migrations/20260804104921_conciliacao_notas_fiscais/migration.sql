-- CreateEnum
CREATE TYPE "InboundInvoiceStatus" AS ENUM ('PENDING', 'RECONCILED', 'DIVERGENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InboundInvoiceSource" AS ENUM ('MANUAL', 'XML_IMPORT', 'SEFAZ');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CREDIT_CARD', 'CASH', 'BANK_SLIP');

-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('CASH', 'NET_30', 'NET_30_60', 'NET_30_60_90');

-- CreateTable
CREATE TABLE "InboundInvoice" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierDocument" TEXT NOT NULL,
    "supplierId" UUID,
    "number" TEXT NOT NULL,
    "series" TEXT,
    "accessKey" VARCHAR(44),
    "issueDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "status" "InboundInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "source" "InboundInvoiceSource" NOT NULL DEFAULT 'MANUAL',
    "xmlPath" TEXT,
    "pdfPath" TEXT,
    "purchaseOrderId" UUID,
    "invoiceId" UUID,
    "reconciledAt" TIMESTAMP(3),
    "reconciledById" UUID,
    "paymentMethod" "PaymentMethod",
    "paymentTerms" "PaymentTerms",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "InboundInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundInvoiceItem" (
    "id" UUID NOT NULL,
    "inboundInvoiceId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboundInvoice_companyId_idx" ON "InboundInvoice"("companyId");

-- CreateIndex
CREATE INDEX "InboundInvoice_status_idx" ON "InboundInvoice"("status");

-- CreateIndex
CREATE INDEX "InboundInvoice_issueDate_idx" ON "InboundInvoice"("issueDate");

-- CreateIndex
CREATE INDEX "InboundInvoice_supplierId_idx" ON "InboundInvoice"("supplierId");

-- CreateIndex
CREATE INDEX "InboundInvoice_purchaseOrderId_idx" ON "InboundInvoice"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "InboundInvoice_number_trgm_idx" ON "InboundInvoice" USING GIN ("number" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "InboundInvoice_supplierName_trgm_idx" ON "InboundInvoice" USING GIN ("supplierName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "InboundInvoice_supplierDocument_trgm_idx" ON "InboundInvoice" USING GIN ("supplierDocument" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "InboundInvoice_companyId_supplierDocument_series_number_key" ON "InboundInvoice"("companyId", "supplierDocument", "series", "number");

-- CreateIndex
CREATE UNIQUE INDEX "InboundInvoice_accessKey_key" ON "InboundInvoice"("accessKey");

-- CreateIndex
CREATE INDEX "InboundInvoiceItem_inboundInvoiceId_idx" ON "InboundInvoiceItem"("inboundInvoiceId");

-- AddForeignKey
ALTER TABLE "InboundInvoice" ADD CONSTRAINT "InboundInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundInvoice" ADD CONSTRAINT "InboundInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundInvoice" ADD CONSTRAINT "InboundInvoice_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundInvoice" ADD CONSTRAINT "InboundInvoice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundInvoice" ADD CONSTRAINT "InboundInvoice_reconciledById_fkey" FOREIGN KEY ("reconciledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundInvoiceItem" ADD CONSTRAINT "InboundInvoiceItem_inboundInvoiceId_fkey" FOREIGN KEY ("inboundInvoiceId") REFERENCES "InboundInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

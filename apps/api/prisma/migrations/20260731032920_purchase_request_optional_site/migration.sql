-- DropForeignKey
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT "PurchaseOrder_constructionSiteId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseRequest" DROP CONSTRAINT "PurchaseRequest_constructionSiteId_fkey";

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "constructionSiteId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PurchaseRequest" ALTER COLUMN "constructionSiteId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_constructionSiteId_fkey" FOREIGN KEY ("constructionSiteId") REFERENCES "ConstructionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_constructionSiteId_fkey" FOREIGN KEY ("constructionSiteId") REFERENCES "ConstructionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

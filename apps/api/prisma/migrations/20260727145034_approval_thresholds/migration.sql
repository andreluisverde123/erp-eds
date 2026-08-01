-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "paymentApprovalThreshold" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "purchaseApprovalThreshold" DECIMAL(14,2) NOT NULL DEFAULT 0;

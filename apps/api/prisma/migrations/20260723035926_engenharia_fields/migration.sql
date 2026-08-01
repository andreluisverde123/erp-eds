-- AlterTable
ALTER TABLE "ConstructionSite" ADD COLUMN     "clientName" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "responsibleName" TEXT;

-- AlterTable
ALTER TABLE "CostCenter" ADD COLUMN     "description" TEXT;

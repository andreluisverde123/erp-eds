-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "Contractor"
  ADD COLUMN "tradeName" TEXT,
  ADD COLUMN "responsibleName" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" VARCHAR(2);

-- AlterTable (tabela vazia até aqui — seguro tornar endDate obrigatório)
ALTER TABLE "ContractorContract"
  ALTER COLUMN "endDate" SET NOT NULL,
  ADD COLUMN "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "ContractorContract_endDate_idx" ON "ContractorContract"("endDate");

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractEmployee" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContractEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractDocument_contractId_idx" ON "ContractDocument"("contractId");
CREATE INDEX "ContractDocument_expiresAt_idx" ON "ContractDocument"("expiresAt");
CREATE INDEX "ContractEmployee_contractId_idx" ON "ContractEmployee"("contractId");

-- AddForeignKey
ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ContractorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractEmployee" ADD CONSTRAINT "ContractEmployee_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ContractorContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

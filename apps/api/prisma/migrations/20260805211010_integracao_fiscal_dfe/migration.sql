-- CreateEnum
CREATE TYPE "FiscalSyncStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'EMPTY', 'SKIPPED', 'ERROR');

-- CreateEnum
CREATE TYPE "FiscalSyncTrigger" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('PENDING', 'FORWARDED', 'PROCESSED', 'ERROR');

-- CreateEnum
CREATE TYPE "FiscalDocumentType" AS ENUM ('NFE_COMPLETA', 'RESUMO_NFE', 'EVENTO_COMPLETO', 'RESUMO_EVENTO', 'DESCONHECIDO');

-- CreateTable
CREATE TABLE "FiscalCertificate" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "encryptedPfx" BYTEA NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "subjectName" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "notBefore" TIMESTAMP(3) NOT NULL,
    "notAfter" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalSyncState" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "lastNSU" VARCHAR(15) NOT NULL DEFAULT '000000000000000',
    "maxNSU" VARCHAR(15) NOT NULL DEFAULT '000000000000000',
    "lastSyncAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "totalImported" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "blockReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalSyncRun" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "trigger" "FiscalSyncTrigger" NOT NULL,
    "status" "FiscalSyncStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "cStat" VARCHAR(3),
    "xMotivo" TEXT,
    "documentsFound" INTEGER NOT NULL DEFAULT 0,
    "documentsImported" INTEGER NOT NULL DEFAULT 0,
    "documentsSkipped" INTEGER NOT NULL DEFAULT 0,
    "nsuFrom" VARCHAR(15),
    "nsuTo" VARCHAR(15),
    "maxNSU" VARCHAR(15),
    "errorMessage" TEXT,
    "triggeredById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FiscalSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FiscalDocument" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "nsu" VARCHAR(15) NOT NULL,
    "schema" TEXT NOT NULL,
    "type" "FiscalDocumentType" NOT NULL,
    "accessKey" VARCHAR(44),
    "xml" BYTEA NOT NULL,
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "forwardedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalCertificate_companyId_key" ON "FiscalCertificate"("companyId");

-- CreateIndex
CREATE INDEX "FiscalCertificate_companyId_idx" ON "FiscalCertificate"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalSyncState_companyId_key" ON "FiscalSyncState"("companyId");

-- CreateIndex
CREATE INDEX "FiscalSyncRun_companyId_startedAt_idx" ON "FiscalSyncRun"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "FiscalSyncRun_status_idx" ON "FiscalSyncRun"("status");

-- CreateIndex
CREATE INDEX "FiscalDocument_companyId_status_idx" ON "FiscalDocument"("companyId", "status");

-- CreateIndex
CREATE INDEX "FiscalDocument_accessKey_idx" ON "FiscalDocument"("accessKey");

-- CreateIndex
CREATE INDEX "FiscalDocument_receivedAt_idx" ON "FiscalDocument"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalDocument_companyId_nsu_key" ON "FiscalDocument"("companyId", "nsu");

-- AddForeignKey
ALTER TABLE "FiscalCertificate" ADD CONSTRAINT "FiscalCertificate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalCertificate" ADD CONSTRAINT "FiscalCertificate_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalSyncState" ADD CONSTRAINT "FiscalSyncState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalSyncRun" ADD CONSTRAINT "FiscalSyncRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalSyncRun" ADD CONSTRAINT "FiscalSyncRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalDocument" ADD CONSTRAINT "FiscalDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

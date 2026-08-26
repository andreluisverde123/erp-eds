-- Boleto: leitura, identificação e vínculo com a conta a pagar.
--
-- Tabela nova e dois enums. Nada existente é alterado — o boleto é documento
-- COMPLEMENTAR: não cria despesa, não substitui a origem da conta a pagar e
-- não dá baixa em nada.

-- CreateEnum
CREATE TYPE "BankSlipSource" AS ENUM ('PDF_UPLOAD', 'MANUAL_ENTRY');

-- CreateEnum
CREATE TYPE "BankSlipStatus" AS ENUM ('PENDING', 'LINKED');

-- CreateTable
CREATE TABLE "BankSlip" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "source" "BankSlipSource" NOT NULL,
    "status" "BankSlipStatus" NOT NULL DEFAULT 'PENDING',
    "fileHash" VARCHAR(64),
    "digitableLine" VARCHAR(47) NOT NULL,
    "barcode" VARCHAR(44) NOT NULL,
    "bankCode" VARCHAR(3) NOT NULL,
    "amount" DECIMAL(14,2),
    "dueDate" TIMESTAMP(3),
    "beneficiaryName" TEXT,
    "beneficiaryDocument" VARCHAR(14),
    "documentNumber" TEXT,
    "ourNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "supplierId" UUID,
    "supplierChosenManually" BOOLEAN NOT NULL DEFAULT false,
    "accountPayableId" UUID,
    "linkedAt" TIMESTAMP(3),
    "linkedById" UUID,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankSlip_pkey" PRIMARY KEY ("id")
);

-- A identidade do boleto é a LINHA DIGITÁVEL, não o arquivo: dois PDFs
-- diferentes do mesmo título trazem a mesma linha. É esta unique que impede o
-- mesmo boleto de virar dois vínculos — e, lá na frente, pagamento em dobro.
CREATE UNIQUE INDEX "BankSlip_companyId_digitableLine_key" ON "BankSlip"("companyId", "digitableLine");

-- Vínculo é 1:1 na prática: uma conta a pagar não deve acumular boletos, e o
-- mesmo boleto não paga duas contas. O índice parcial deixa vários NULL
-- conviverem (todo boleto ainda pendente) e barra o segundo vínculo.
CREATE UNIQUE INDEX "BankSlip_accountPayableId_key" ON "BankSlip"("accountPayableId") WHERE "accountPayableId" IS NOT NULL;

-- Coerência entre status e vínculo, no banco e não só no service: LINKED exige
-- conta, data e autor; PENDING exige que os três estejam vazios. Sem isto, um
-- bug de código poderia deixar um boleto "vinculado" a nada.
ALTER TABLE "BankSlip" ADD CONSTRAINT "BankSlip_link_consistency_check"
    CHECK (
      ("status" = 'LINKED'  AND num_nonnulls("accountPayableId", "linkedAt", "linkedById") = 3)
      OR
      ("status" = 'PENDING' AND num_nonnulls("accountPayableId", "linkedAt", "linkedById") = 0)
    );

-- CreateIndex
CREATE INDEX "BankSlip_companyId_status_idx" ON "BankSlip"("companyId", "status");

-- CreateIndex
CREATE INDEX "BankSlip_accountPayableId_idx" ON "BankSlip"("accountPayableId");

-- CreateIndex
CREATE INDEX "BankSlip_supplierId_idx" ON "BankSlip"("supplierId");

-- CreateIndex
CREATE INDEX "BankSlip_dueDate_idx" ON "BankSlip"("dueDate");

-- AddForeignKey
ALTER TABLE "BankSlip" ADD CONSTRAINT "BankSlip_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- RESTRICT nos três: apagar fisicamente um fornecedor, uma conta a pagar ou o
-- usuário que enviou não pode levar junto a prova documental de uma despesa.
ALTER TABLE "BankSlip" ADD CONSTRAINT "BankSlip_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankSlip" ADD CONSTRAINT "BankSlip_accountPayableId_fkey" FOREIGN KEY ("accountPayableId") REFERENCES "AccountPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankSlip" ADD CONSTRAINT "BankSlip_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankSlip" ADD CONSTRAINT "BankSlip_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

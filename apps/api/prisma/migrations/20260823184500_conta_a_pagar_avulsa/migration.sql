-- Conta a Pagar avulsa: a conta deixa de exigir nota fiscal.
--
-- Nenhuma linha é apagada e nenhuma coluna é removida. As contas que já
-- existem continuam apontando para a nota delas e passam a carregar, na
-- própria linha, o fornecedor e a atribuição de custo que antes só existiam
-- por travessia.
--
-- A ordem abaixo importa: as colunas nascem NULL, são preenchidas a partir da
-- nota, e só então recebem NOT NULL. Criar `supplierId` já como NOT NULL
-- falharia na hora em qualquer base com dados.

-- CreateEnum
CREATE TYPE "AccountPayableOrigin" AS ENUM ('INVOICE', 'MANUAL');

-- AlterTable: a nota deixa de ser obrigatória
ALTER TABLE "AccountPayable" ALTER COLUMN "invoiceId" DROP NOT NULL;

-- AlterTable: colunas novas, todas anuláveis neste primeiro momento
ALTER TABLE "AccountPayable" ADD COLUMN     "origin" "AccountPayableOrigin",
ADD COLUMN     "supplierId" UUID,
ADD COLUMN     "costCenterId" UUID,
ADD COLUMN     "constructionSiteId" UUID,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "documentNumber" TEXT,
ADD COLUMN     "issueDate" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "notes" TEXT;

-- Backfill.
--
-- Toda conta que existe hoje nasceu de uma nota, então `origin` é INVOICE
-- para todas elas — inclusive as soft-deletadas, que precisam continuar
-- válidas para a Lixeira conseguir restaurá-las.
--
-- `supplierId` vem da nota, onde é NOT NULL: o backfill não tem como deixar
-- buraco. `costCenterId` e `constructionSiteId` também vêm da nota, mas lá
-- são opcionais — onde a nota não tem, a conta fica sem, que é a informação
-- correta (não havia atribuição de custo).
UPDATE "AccountPayable" AS ap
SET "origin"             = 'INVOICE',
    "supplierId"         = i."supplierId",
    "costCenterId"       = i."costCenterId",
    "constructionSiteId" = i."constructionSiteId"
FROM "Invoice" AS i
WHERE ap."invoiceId" = i."id";

-- Rede de proteção: se sobrar alguma conta sem fornecedor depois do backfill
-- (só aconteceria com uma conta órfã, que a FK atual já impede), a migration
-- para aqui em vez de gravar NOT NULL por cima de dado incompleto.
DO $$
DECLARE orfas INTEGER;
BEGIN
  SELECT count(*) INTO orfas FROM "AccountPayable" WHERE "supplierId" IS NULL;
  IF orfas > 0 THEN
    RAISE EXCEPTION 'Backfill incompleto: % conta(s) a pagar sem fornecedor. Migration abortada sem alterar nada.', orfas;
  END IF;
END $$;

-- Agora sim: os dois campos que toda conta tem, tendo nota ou não.
ALTER TABLE "AccountPayable" ALTER COLUMN "origin" SET NOT NULL;
ALTER TABLE "AccountPayable" ALTER COLUMN "supplierId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "AccountPayable_supplierId_idx" ON "AccountPayable"("supplierId");

-- CreateIndex
CREATE INDEX "AccountPayable_costCenterId_idx" ON "AccountPayable"("costCenterId");

-- CreateIndex
CREATE INDEX "AccountPayable_origin_idx" ON "AccountPayable"("origin");

-- AddForeignKey
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_constructionSiteId_fkey" FOREIGN KEY ("constructionSiteId") REFERENCES "ConstructionSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

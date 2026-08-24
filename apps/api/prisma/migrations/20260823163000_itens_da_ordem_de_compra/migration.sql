-- Itens da Ordem de Compra.
--
-- Migration puramente ADITIVA: cria uma tabela nova e não toca em nenhuma
-- linha existente. As ordens já emitidas continuam válidas e passam a ter
-- simplesmente uma lista de itens vazia — ver a nota sobre dados existentes
-- em `docs/plano-evolucoes.md`.
--
-- `purchaseRequestItemId` é NOT NULL: é o vínculo no nível do ITEM, que é o
-- ponto desta etapa. `ON DELETE RESTRICT` protege esse vínculo de sumir por
-- baixo; `ON DELETE CASCADE` no lado da ordem faz a limpeza natural quando
-- uma ordem for apagada de verdade (o sistema usa exclusão lógica, então na
-- prática não dispara).

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "purchaseRequestItemId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "totalPrice" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseRequestItemId_idx" ON "PurchaseOrderItem"("purchaseRequestItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderItem_purchaseOrderId_purchaseRequestItemId_key" ON "PurchaseOrderItem"("purchaseOrderId", "purchaseRequestItemId");

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseRequestItemId_fkey" FOREIGN KEY ("purchaseRequestItemId") REFERENCES "PurchaseRequestItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

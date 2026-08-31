-- Quem EMITIU a ordem de compra.
--
-- É o nome que assina o PDF. Sem ele, o documento que vai ao fornecedor não
-- diz de quem partiu o pedido — e o campo de assinatura ficaria sem dono.
--
-- Opcional porque as ordens anteriores a esta coluna não têm autor, e
-- atribuí-las a alguém seria inventar uma assinatura. Nelas o PDF imprime a
-- linha sem nome, que é o que um documento para assinar à mão sempre foi.
ALTER TABLE "PurchaseOrder" ADD COLUMN "createdById" UUID;

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PurchaseOrder_createdById_idx" ON "PurchaseOrder"("createdById");

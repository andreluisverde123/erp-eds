-- Item de solicitação de compra marcado como EM ESTOQUE: o material já existe
-- no estoque físico e a linha não será comprada.
--
-- Aditiva: coluna nova com padrão false. Nenhuma linha existente muda.

ALTER TABLE "PurchaseRequestItem" ADD COLUMN "inStock" BOOLEAN NOT NULL DEFAULT false;

-- Em estoque não tem cotação: sem preço, sem "fornecedor não tem" e sem
-- desconto. O service limpa os três ao marcar; o CHECK é a defesa para escrita
-- por fora da API. Todas as linhas existentes têm inStock = false e passam.
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_inStock_sem_cotacao" CHECK (
  NOT "inStock" OR ("estimatedUnitPrice" IS NULL AND "unavailable" = false AND "discountValue" = 0)
);

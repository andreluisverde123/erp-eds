-- Desconto na ordem de compra, nos mesmos dois níveis da solicitação.
--
-- O desconto negociado na cotação não chegava à ordem: ela nascia com o preço
-- bruto e saía acima do acordado, sem nada explicando a diferença.
--
-- Colunas com valor padrão neutro: toda ordem existente continua com desconto
-- zero, e `totalPrice`/`totalAmount` das linhas antigas seguem corretos sem
-- recálculo — `bruto − 0` é o próprio bruto.
ALTER TABLE "PurchaseOrder"
  ADD COLUMN "discountType"  "DiscountType" NOT NULL DEFAULT 'AMOUNT',
  ADD COLUMN "discountValue" DECIMAL(14,2)  NOT NULL DEFAULT 0;

ALTER TABLE "PurchaseOrderItem"
  ADD COLUMN "discountType"  "DiscountType" NOT NULL DEFAULT 'AMOUNT',
  ADD COLUMN "discountValue" DECIMAL(14,2)  NOT NULL DEFAULT 0;

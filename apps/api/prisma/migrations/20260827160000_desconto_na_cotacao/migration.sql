-- Desconto na cotação, em dois níveis: por item e sobre o total.
--
-- Cada nível guarda apenas a ENTRADA do cálculo — como o desconto foi
-- informado (`AMOUNT` em reais ou `PERCENT`) e quanto. O valor em reais e o
-- total da solicitação continuam DERIVADOS a cada leitura, como sempre foram:
-- `PurchaseRequest` nunca teve total gravado, e criar um agora significaria
-- dois números para a mesma verdade, divergindo no primeiro item editado.
--
-- Guardar o TIPO, e não só o valor resolvido, preserva a intenção de quem
-- digitou: "10%" continua valendo 10% se o preço unitário mudar; "R$ 100"
-- continua sendo cem reais. Sem esta coluna, reabrir a cotação mostraria um
-- valor em reais que ninguém digitou.
--
-- Aditiva e reversível: quatro colunas novas, nenhuma linha alterada. O
-- default `0`/`AMOUNT` é exatamente "sem desconto", então toda solicitação
-- existente vale hoje o que valia ontem.

CREATE TYPE "DiscountType" AS ENUM ('AMOUNT', 'PERCENT');

ALTER TABLE "PurchaseRequest"
  ADD COLUMN "discountType" "DiscountType" NOT NULL DEFAULT 'AMOUNT',
  ADD COLUMN "discountValue" DECIMAL(14,2) NOT NULL DEFAULT 0;

ALTER TABLE "PurchaseRequestItem"
  ADD COLUMN "discountType" "DiscountType" NOT NULL DEFAULT 'AMOUNT',
  ADD COLUMN "discountValue" DECIMAL(14,2) NOT NULL DEFAULT 0;

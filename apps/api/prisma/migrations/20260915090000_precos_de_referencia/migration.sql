-- PREÇOS DE REFERÊNCIA (ORC-03).
--
-- Histórico de preço por insumo, por data. Inteiramente aditiva:
--   * um enum novo;
--   * uma tabela nova, que nasce VAZIA.
--
-- **NENHUM BACKFILL.** Os preços já digitados nas composições
-- (`CompositionItem.unitPrice`) NÃO viram histórico: eles são o valor que
-- aquela composição usa, escolhido por alguém num momento, sem data de
-- referência nem origem. Transformá-los em "preço de referência" inventaria
-- uma data e uma procedência que ninguém informou.
--
-- Nenhuma tabela existente é alterada — nem `CatalogItem`, que continua sem
-- preço, nem `CompositionItem`, nem Compras.
--
-- Nenhuma permissão nova: o histórico usa `composicoes.view` e
-- `composicoes.manage` (e `compras.view` para ler a compra de origem).

CREATE TYPE "CatalogItemPriceSource" AS ENUM ('MANUAL', 'PURCHASE');

CREATE TABLE "CatalogItemPrice" (
  "id"                  UUID                     NOT NULL,
  "companyId"           UUID                     NOT NULL,
  "catalogItemId"       UUID                     NOT NULL,
  "unitPrice"           DECIMAL(14,4)            NOT NULL,
  "unit"                TEXT                     NOT NULL,
  "source"              "CatalogItemPriceSource" NOT NULL,
  "referenceDate"       DATE                     NOT NULL,
  "note"                TEXT,
  "purchaseOrderId"     UUID,
  "purchaseOrderItemId" UUID,
  "createdById"         UUID,
  "createdAt"           TIMESTAMP(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CatalogItemPrice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CatalogItemPrice_unitPrice_not_negative" CHECK ("unitPrice" >= 0),
  -- A compra de origem existe SE E SOMENTE SE a origem é PURCHASE. Vale também
  -- para as origens futuras (SINAPI, IMPORT), que não têm ordem de compra.
  CONSTRAINT "CatalogItemPrice_purchase_reference" CHECK (
    ("source" = 'PURCHASE') = ("purchaseOrderId" IS NOT NULL AND "purchaseOrderItemId" IS NOT NULL)
  )
);

-- A mesma linha de compra não vira dois preços de referência.
CREATE UNIQUE INDEX "CatalogItemPrice_purchaseOrderItemId_key" ON "CatalogItemPrice" ("purchaseOrderItemId");

CREATE INDEX "CatalogItemPrice_companyId_idx" ON "CatalogItemPrice" ("companyId");
-- "O mais recente com referenceDate <= D": índice na ordem exata da consulta.
CREATE INDEX "CatalogItemPrice_catalogItemId_referenceDate_createdAt_idx"
  ON "CatalogItemPrice" ("catalogItemId", "referenceDate" DESC, "createdAt" DESC);
CREATE INDEX "CatalogItemPrice_purchaseOrderId_idx" ON "CatalogItemPrice" ("purchaseOrderId");

ALTER TABLE "CatalogItemPrice"
  ADD CONSTRAINT "CatalogItemPrice_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CatalogItemPrice"
  ADD CONSTRAINT "CatalogItemPrice_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ordem de compra só sofre exclusão lógica; o RESTRICT nunca dispara na
-- operação normal. A LINHA da ordem, ao contrário, é apagada e recriada quando a
-- ordem é editada — por isso `purchaseOrderItemId` não tem FK.
ALTER TABLE "CatalogItemPrice"
  ADD CONSTRAINT "CatalogItemPrice_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CatalogItemPrice"
  ADD CONSTRAINT "CatalogItemPrice_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

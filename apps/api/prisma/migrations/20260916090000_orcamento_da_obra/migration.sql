-- ORÇAMENTO DA OBRA + EAP (ORC-04).
--
-- Inteiramente aditiva:
--   * dois enums novos;
--   * quatro tabelas novas, que nascem VAZIAS;
--   * duas permissões, com ON CONFLICT DO NOTHING.
--
-- **NENHUM BACKFILL.** `ConstructionSite.budgetAmount` não vira orçamento, e
-- nenhuma composição, insumo ou preço é tocado. Nenhuma tabela existente é
-- alterada.

CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'CLOSED');
CREATE TYPE "BudgetItemSource" AS ENUM ('COMPOSITION', 'CATALOG_ITEM', 'MANUAL');

-- ORÇAMENTO. Sem coluna de total: tudo é derivado dos itens.
CREATE TABLE "Budget" (
  "id"                 UUID           NOT NULL,
  "companyId"          UUID           NOT NULL,
  "constructionSiteId" UUID           NOT NULL,
  "code"               TEXT           NOT NULL,
  "version"            INTEGER        NOT NULL DEFAULT 1,
  "name"               TEXT           NOT NULL,
  "searchKey"          TEXT           NOT NULL,
  "description"        TEXT,
  "referenceDate"      DATE           NOT NULL,
  "status"             "BudgetStatus" NOT NULL DEFAULT 'DRAFT',
  "closedAt"           TIMESTAMP(3),
  "closedById"         UUID,
  "createdById"        UUID,
  "createdAt"          TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3)   NOT NULL,
  "deletedAt"          TIMESTAMP(3),

  CONSTRAINT "Budget_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Budget_version_positive" CHECK ("version" >= 1),
  -- Fechado se e somente se tem data de fechamento.
  CONSTRAINT "Budget_closed_has_date" CHECK (("status" = 'CLOSED') = ("closedAt" IS NOT NULL))
);

-- Versão no unique: a revisão do ORC-0001 será o ORC-0001 v2.
CREATE UNIQUE INDEX "Budget_companyId_code_version_key" ON "Budget" ("companyId", "code", "version");
CREATE INDEX "Budget_companyId_idx"          ON "Budget" ("companyId");
CREATE INDEX "Budget_companyId_status_idx"   ON "Budget" ("companyId", "status");
CREATE INDEX "Budget_constructionSiteId_idx" ON "Budget" ("constructionSiteId");

ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_constructionSiteId_fkey"
  FOREIGN KEY ("constructionSiteId") REFERENCES "ConstructionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_closedById_fkey"
  FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EAP. O código ("2.1") não é coluna: é derivado da posição.
CREATE TABLE "BudgetNode" (
  "id"        UUID         NOT NULL,
  "budgetId"  UUID         NOT NULL,
  "parentId"  UUID,
  "name"      TEXT         NOT NULL,
  "position"  INTEGER      NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BudgetNode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BudgetNode_not_own_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id")
);

-- Alvo das FKs compostas abaixo: (id, orçamento).
CREATE UNIQUE INDEX "BudgetNode_id_budgetId_key" ON "BudgetNode" ("id", "budgetId");
CREATE INDEX "BudgetNode_budgetId_idx" ON "BudgetNode" ("budgetId");
CREATE INDEX "BudgetNode_parentId_idx" ON "BudgetNode" ("parentId");

ALTER TABLE "BudgetNode"
  ADD CONSTRAINT "BudgetNode_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A ESTRUTURA NÃO VAZA ENTRE ORÇAMENTOS. O pai é referenciado pelo PAR
-- (parentId, budgetId): um pai de outro orçamento não casa, e o banco recusa.
-- NO ACTION, e não RESTRICT, porque a exclusão de um grupo apaga a subárvore
-- inteira num único DELETE, e NO ACTION confere a FK no fim do comando.
ALTER TABLE "BudgetNode"
  ADD CONSTRAINT "BudgetNode_parentId_budgetId_fkey"
  FOREIGN KEY ("parentId", "budgetId") REFERENCES "BudgetNode"("id", "budgetId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ITEM DO ORÇAMENTO. Snapshot: descrição, unidade, quantidade e custo são da
-- linha. Sem coluna de total.
CREATE TABLE "BudgetItem" (
  "id"               UUID               NOT NULL,
  "budgetId"         UUID               NOT NULL,
  "budgetNodeId"     UUID               NOT NULL,
  "position"         INTEGER            NOT NULL,
  "source"           "BudgetItemSource" NOT NULL,
  "compositionId"    UUID,
  "catalogItemId"    UUID,
  "referencePriceId" UUID,
  "sourceCode"       TEXT,
  "catalogItemType"  "CatalogItemType",
  "description"      TEXT               NOT NULL,
  "unit"             TEXT               NOT NULL,
  "quantity"         DECIMAL(14,4)      NOT NULL,
  "unitCost"         DECIMAL(14,4)      NOT NULL,
  "createdAt"        TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3)       NOT NULL,

  CONSTRAINT "BudgetItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BudgetItem_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "BudgetItem_unitCost_not_negative" CHECK ("unitCost" >= 0),
  -- A origem e as referências andam juntas.
  CONSTRAINT "BudgetItem_source_references" CHECK (
       ("source" = 'COMPOSITION'  AND "compositionId" IS NOT NULL AND "catalogItemId" IS NULL AND "referencePriceId" IS NULL)
    OR ("source" = 'CATALOG_ITEM' AND "catalogItemId" IS NOT NULL AND "compositionId" IS NULL)
    OR ("source" = 'MANUAL'       AND "compositionId" IS NULL AND "catalogItemId" IS NULL AND "referencePriceId" IS NULL)
  )
);

CREATE INDEX "BudgetItem_budgetId_idx"      ON "BudgetItem" ("budgetId");
CREATE INDEX "BudgetItem_budgetNodeId_idx"  ON "BudgetItem" ("budgetNodeId");
CREATE INDEX "BudgetItem_compositionId_idx" ON "BudgetItem" ("compositionId");
CREATE INDEX "BudgetItem_catalogItemId_idx" ON "BudgetItem" ("catalogItemId");

ALTER TABLE "BudgetItem"
  ADD CONSTRAINT "BudgetItem_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- O item só pode estar num nó DO MESMO orçamento.
ALTER TABLE "BudgetItem"
  ADD CONSTRAINT "BudgetItem_budgetNodeId_budgetId_fkey"
  FOREIGN KEY ("budgetNodeId", "budgetId") REFERENCES "BudgetNode"("id", "budgetId") ON DELETE NO ACTION ON UPDATE NO ACTION;
-- Rastreio da origem. Composição, insumo e preço só sofrem exclusão lógica ou
-- não são excluídos; RESTRICT nunca dispara na operação normal.
ALTER TABLE "BudgetItem"
  ADD CONSTRAINT "BudgetItem_compositionId_fkey"
  FOREIGN KEY ("compositionId") REFERENCES "Composition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetItem"
  ADD CONSTRAINT "BudgetItem_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BudgetItem"
  ADD CONSTRAINT "BudgetItem_referencePriceId_fkey"
  FOREIGN KEY ("referencePriceId") REFERENCES "CatalogItemPrice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CÓPIA DAS LINHAS DA COMPOSIÇÃO no momento da inclusão.
CREATE TABLE "BudgetItemComponent" (
  "id"            UUID              NOT NULL,
  "budgetItemId"  UUID              NOT NULL,
  "catalogItemId" UUID              NOT NULL,
  "code"          TEXT              NOT NULL,
  "name"          TEXT              NOT NULL,
  "type"          "CatalogItemType" NOT NULL,
  "unit"          TEXT              NOT NULL,
  "coefficient"   DECIMAL(14,6)     NOT NULL,
  "unitPrice"     DECIMAL(14,4)     NOT NULL,
  "position"      INTEGER           NOT NULL,

  CONSTRAINT "BudgetItemComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BudgetItemComponent_coefficient_positive" CHECK ("coefficient" > 0),
  CONSTRAINT "BudgetItemComponent_unitPrice_not_negative" CHECK ("unitPrice" >= 0)
);

CREATE INDEX "BudgetItemComponent_budgetItemId_idx"  ON "BudgetItemComponent" ("budgetItemId");
CREATE INDEX "BudgetItemComponent_catalogItemId_idx" ON "BudgetItemComponent" ("catalogItemId");

ALTER TABLE "BudgetItemComponent"
  ADD CONSTRAINT "BudgetItemComponent_budgetItemId_fkey"
  FOREIGN KEY ("budgetItemId") REFERENCES "BudgetItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetItemComponent"
  ADD CONSTRAINT "BudgetItemComponent_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PERMISSÕES.
--
-- `orcamentos.*`, separadas de `composicoes.*`: o orçamento é documento POR
-- OBRA, com fechamento. Quem fecha orçamento não precisa manter o cadastro de
-- composições, e vice-versa.
INSERT INTO "Permission" ("id", "code", "module", "action", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'orcamentos.view',   'orcamentos', 'view',   'Consultar orçamentos de obra, a EAP, os itens e os totais.', NOW(), NOW()),
  (gen_random_uuid(), 'orcamentos.manage', 'orcamentos', 'manage', 'Criar e editar orçamentos em rascunho, montar a EAP, incluir itens e fechar o orçamento.', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

-- Administração e Engenharia gerenciam; Diretoria consulta. Compras não recebe.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), r."id", p."id", NOW(), NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('orcamentos.view', 'orcamentos.manage')
WHERE r."type" IN ('ADMIN', 'ENGINEER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), r."id", p."id", NOW(), NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" = 'orcamentos.view'
WHERE r."type" = 'VIEWER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

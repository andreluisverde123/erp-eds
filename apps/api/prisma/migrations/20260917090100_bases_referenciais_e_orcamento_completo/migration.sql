-- ORC-05 (2/2): BASES REFERENCIAIS (SINAPI, SICRO) E O FECHAMENTO DO ORÇAMENTO.
--
-- Aditiva:
--   * enums e tabelas novas, que nascem VAZIAS;
--   * colunas NULLABLE (ou com default) em Budget, BudgetItem,
--     BudgetItemComponent e ConstructionSite;
--   * o CHECK de origem do item é REESCRITO para aceitar REFERENCE — as três
--     origens anteriores continuam exigindo exatamente o que exigiam.
--
-- Nenhum dado existente é alterado. Nenhum backfill: itens de composição do
-- ORC-04 ficam com `compositionPricing` nulo (foram precificados pelo preço da
-- linha da composição, sem consulta ao histórico), e `budgetAmount` continua
-- onde está.

-- -----------------------------------------------------------------------------
-- BASES REFERENCIAIS
-- -----------------------------------------------------------------------------
--
-- GLOBAIS, sem `companyId`. SINAPI e SICRO são dados públicos, idênticos para
-- qualquer empresa; copiá-los por inquilino multiplicaria ~70 mil linhas por
-- importação sem ganho nenhum. São somente leitura para as empresas: nenhuma
-- rota altera um dataset depois de importado. Quem importou fica registrado.

CREATE TYPE "ReferenceSource" AS ENUM ('SINAPI', 'SICRO');
CREATE TYPE "ReferenceRegime" AS ENUM ('NAO_DESONERADO', 'DESONERADO', 'SEM_ENCARGOS');
CREATE TYPE "ReferenceComponentKind" AS ENUM ('INPUT', 'COMPOSITION', 'EQUIPMENT', 'LABOR', 'MATERIAL', 'AUXILIARY', 'FIXED_TIME', 'TRANSPORT');

CREATE TABLE "ReferenceDataset" (
  "id"                  UUID              NOT NULL,
  "source"              "ReferenceSource" NOT NULL,
  "competence"          VARCHAR(7)        NOT NULL,
  "referenceDate"       DATE              NOT NULL,
  "uf"                  VARCHAR(2)        NOT NULL,
  "locality"            TEXT,
  "regime"              "ReferenceRegime" NOT NULL,
  "versionLabel"        TEXT              NOT NULL DEFAULT '',
  "publishedAt"         DATE,
  "fileNames"           TEXT[],
  "fileHash"            TEXT              NOT NULL,
  "itemCount"           INTEGER           NOT NULL,
  "compositionCount"    INTEGER           NOT NULL,
  "metadata"            JSONB             NOT NULL DEFAULT '{}',
  "importedByCompanyId" UUID              NOT NULL,
  "importedById"        UUID,
  "importedAt"          TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReferenceDataset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferenceDataset_competence_format" CHECK ("competence" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "ReferenceDataset_counts_not_negative" CHECK ("itemCount" >= 0 AND "compositionCount" >= 0)
);

-- A MESMA referência não entra duas vezes. Uma republicação ("revisado") entra
-- com rótulo de versão próprio.
CREATE UNIQUE INDEX "ReferenceDataset_source_competence_uf_regime_versionLabel_key"
  ON "ReferenceDataset" ("source", "competence", "uf", "regime", "versionLabel");
CREATE INDEX "ReferenceDataset_source_uf_regime_referenceDate_idx"
  ON "ReferenceDataset" ("source", "uf", "regime", "referenceDate");

ALTER TABLE "ReferenceDataset"
  ADD CONSTRAINT "ReferenceDataset_importedByCompanyId_fkey"
  FOREIGN KEY ("importedByCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReferenceDataset"
  ADD CONSTRAINT "ReferenceDataset_importedById_fkey"
  FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ReferenceItem" (
  "id"          UUID          NOT NULL,
  "datasetId"   UUID          NOT NULL,
  "code"        TEXT          NOT NULL,
  "description" TEXT          NOT NULL,
  "searchKey"   TEXT          NOT NULL,
  "unit"        TEXT          NOT NULL,
  "category"    TEXT,
  "unitPrice"   DECIMAL(14,4),
  "metadata"    JSONB         NOT NULL DEFAULT '{}',

  CONSTRAINT "ReferenceItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferenceItem_unitPrice_not_negative" CHECK ("unitPrice" IS NULL OR "unitPrice" >= 0)
);

CREATE UNIQUE INDEX "ReferenceItem_datasetId_code_key" ON "ReferenceItem" ("datasetId", "code");
-- Busca server-side dentro do dataset: prefixo de código e de descrição
-- (btree text_pattern_ops) e trecho no meio da descrição (GIN trigram).
CREATE INDEX "ReferenceItem_datasetId_code_prefix_idx"      ON "ReferenceItem" ("datasetId", "code" text_pattern_ops);
CREATE INDEX "ReferenceItem_datasetId_searchKey_prefix_idx" ON "ReferenceItem" ("datasetId", "searchKey" text_pattern_ops);
CREATE INDEX "ReferenceItem_searchKey_trgm_idx"             ON "ReferenceItem" USING GIN ("searchKey" gin_trgm_ops);

ALTER TABLE "ReferenceItem"
  ADD CONSTRAINT "ReferenceItem_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "ReferenceDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReferenceComposition" (
  "id"          UUID          NOT NULL,
  "datasetId"   UUID          NOT NULL,
  "code"        TEXT          NOT NULL,
  "description" TEXT          NOT NULL,
  "searchKey"   TEXT          NOT NULL,
  "unit"        TEXT          NOT NULL,
  "group"       TEXT,
  -- Custo OFICIAL. Nulo = a base declara a composição sem custo.
  "unitCost"    DECIMAL(14,4),
  "situation"   TEXT,
  "metadata"    JSONB         NOT NULL DEFAULT '{}',

  CONSTRAINT "ReferenceComposition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferenceComposition_unitCost_not_negative" CHECK ("unitCost" IS NULL OR "unitCost" >= 0)
);

CREATE UNIQUE INDEX "ReferenceComposition_datasetId_code_key" ON "ReferenceComposition" ("datasetId", "code");
CREATE INDEX "ReferenceComposition_datasetId_code_prefix_idx"      ON "ReferenceComposition" ("datasetId", "code" text_pattern_ops);
CREATE INDEX "ReferenceComposition_datasetId_searchKey_prefix_idx" ON "ReferenceComposition" ("datasetId", "searchKey" text_pattern_ops);
CREATE INDEX "ReferenceComposition_searchKey_trgm_idx"             ON "ReferenceComposition" USING GIN ("searchKey" gin_trgm_ops);

ALTER TABLE "ReferenceComposition"
  ADD CONSTRAINT "ReferenceComposition_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "ReferenceDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A COMPOSIÇÃO ANALÍTICA, linha a linha, como a base publica.
CREATE TABLE "ReferenceCompositionItem" (
  "id"            UUID                     NOT NULL,
  "compositionId" UUID                     NOT NULL,
  "position"      INTEGER                  NOT NULL,
  "section"       TEXT,
  "kind"          "ReferenceComponentKind" NOT NULL,
  "code"          TEXT                     NOT NULL,
  "description"   TEXT                     NOT NULL,
  "unit"          TEXT,
  -- Sete casas: o SINAPI publica coeficientes com até 7 (verificado em 08/2026).
  "coefficient"   DECIMAL(18,7),
  "unitPrice"     DECIMAL(14,4),
  "totalCost"     DECIMAL(14,4),
  "situation"     TEXT,
  "metadata"      JSONB                    NOT NULL DEFAULT '{}',

  CONSTRAINT "ReferenceCompositionItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReferenceCompositionItem_compositionId_position_idx"
  ON "ReferenceCompositionItem" ("compositionId", "position");

ALTER TABLE "ReferenceCompositionItem"
  ADD CONSTRAINT "ReferenceCompositionItem_compositionId_fkey"
  FOREIGN KEY ("compositionId") REFERENCES "ReferenceComposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- ORÇAMENTO: BDI, REVISÃO E ORÇAMENTO OFICIAL
-- -----------------------------------------------------------------------------

-- BDI em percentual (25 = 25%). Default 0: orçamento existente continua com
-- preço final igual ao custo direto.
ALTER TABLE "Budget" ADD COLUMN "bdiPercent" DECIMAL(7,4) NOT NULL DEFAULT 0;
ALTER TABLE "Budget" ADD COLUMN "bdiNote" TEXT;
-- De qual versão esta foi revisada. Nulo na v1.
ALTER TABLE "Budget" ADD COLUMN "revisedFromId" UUID;

ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_bdiPercent_range" CHECK ("bdiPercent" >= 0 AND "bdiPercent" <= 1000);

-- Alvo da FK composta do orçamento oficial da obra.
CREATE UNIQUE INDEX "Budget_id_constructionSiteId_key" ON "Budget" ("id", "constructionSiteId");

ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_revisedFromId_fkey"
  FOREIGN KEY ("revisedFromId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ORÇAMENTO OFICIAL DA OBRA.
--
-- A FK é composta (orçamento, obra) → Budget(id, constructionSiteId): o banco
-- recusa apontar como oficial um orçamento de OUTRA obra. Ser fechado é regra
-- do service, dentro de transação com trava.
ALTER TABLE "ConstructionSite" ADD COLUMN "currentBudgetId" UUID;

CREATE UNIQUE INDEX "ConstructionSite_currentBudgetId_id_key" ON "ConstructionSite" ("currentBudgetId", "id");

ALTER TABLE "ConstructionSite"
  ADD CONSTRAINT "ConstructionSite_currentBudgetId_id_fkey"
  FOREIGN KEY ("currentBudgetId", "id") REFERENCES "Budget"("id", "constructionSiteId") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- -----------------------------------------------------------------------------
-- ITEM REFERENCIAL E PRECIFICAÇÃO DE COMPOSIÇÃO PRÓPRIA
-- -----------------------------------------------------------------------------

CREATE TYPE "BudgetCompositionPricing" AS ENUM ('HISTORICAL', 'FALLBACK', 'MIXED');
CREATE TYPE "BudgetComponentPriceOrigin" AS ENUM ('HISTORICAL', 'FALLBACK');

-- Snapshot da referência NO PRÓPRIO ITEM: fonte, código, competência, UF,
-- regime e tipo. Os ids são rastreio e viram nulo se a base for removida um
-- dia; o snapshot continua respondendo "de onde veio este custo".
ALTER TABLE "BudgetItem" ADD COLUMN "referenceDatasetId"     UUID;
ALTER TABLE "BudgetItem" ADD COLUMN "referenceItemId"        UUID;
ALTER TABLE "BudgetItem" ADD COLUMN "referenceCompositionId" UUID;
ALTER TABLE "BudgetItem" ADD COLUMN "referenceSource"        "ReferenceSource";
ALTER TABLE "BudgetItem" ADD COLUMN "referenceKind"          TEXT;
ALTER TABLE "BudgetItem" ADD COLUMN "referenceCode"          TEXT;
ALTER TABLE "BudgetItem" ADD COLUMN "referenceCompetence"    VARCHAR(7);
ALTER TABLE "BudgetItem" ADD COLUMN "referenceUf"            VARCHAR(2);
ALTER TABLE "BudgetItem" ADD COLUMN "referenceLocality"      TEXT;
ALTER TABLE "BudgetItem" ADD COLUMN "referenceRegime"        "ReferenceRegime";
ALTER TABLE "BudgetItem" ADD COLUMN "referenceVersionLabel"  TEXT;
-- Só COMPOSITION: se as linhas usaram preço histórico, o fallback da própria
-- composição, ou os dois.
ALTER TABLE "BudgetItem" ADD COLUMN "compositionPricing"     "BudgetCompositionPricing";

CREATE INDEX "BudgetItem_referenceDatasetId_idx" ON "BudgetItem" ("referenceDatasetId");

ALTER TABLE "BudgetItem"
  ADD CONSTRAINT "BudgetItem_referenceDatasetId_fkey"
  FOREIGN KEY ("referenceDatasetId") REFERENCES "ReferenceDataset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetItem"
  ADD CONSTRAINT "BudgetItem_referenceItemId_fkey"
  FOREIGN KEY ("referenceItemId") REFERENCES "ReferenceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetItem"
  ADD CONSTRAINT "BudgetItem_referenceCompositionId_fkey"
  FOREIGN KEY ("referenceCompositionId") REFERENCES "ReferenceComposition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O CHECK de origem ganha REFERENCE. As três origens do ORC-04 continuam
-- exigindo o que exigiam, e agora também não podem carregar snapshot de
-- referência.
ALTER TABLE "BudgetItem" DROP CONSTRAINT "BudgetItem_source_references";
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_source_references" CHECK (
     ("source" = 'COMPOSITION'  AND "compositionId" IS NOT NULL AND "catalogItemId" IS NULL AND "referencePriceId" IS NULL AND "referenceSource" IS NULL)
  OR ("source" = 'CATALOG_ITEM' AND "catalogItemId" IS NOT NULL AND "compositionId" IS NULL AND "referenceSource" IS NULL)
  OR ("source" = 'MANUAL'       AND "compositionId" IS NULL AND "catalogItemId" IS NULL AND "referencePriceId" IS NULL AND "referenceSource" IS NULL)
  OR ("source" = 'REFERENCE'    AND "compositionId" IS NULL AND "catalogItemId" IS NULL AND "referencePriceId" IS NULL
      AND "referenceSource" IS NOT NULL AND "referenceCode" IS NOT NULL AND "referenceCompetence" IS NOT NULL
      AND "referenceUf" IS NOT NULL AND "referenceRegime" IS NOT NULL AND "referenceKind" IN ('ITEM', 'COMPOSITION'))
);
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_composition_pricing_only_composition" CHECK (
  "compositionPricing" IS NULL OR "source" = 'COMPOSITION'
);

-- A linha copiada da composição própria diz de onde veio o preço dela.
ALTER TABLE "BudgetItemComponent" ADD COLUMN "priceOrigin" "BudgetComponentPriceOrigin";
ALTER TABLE "BudgetItemComponent" ADD COLUMN "referencePriceId" UUID;

ALTER TABLE "BudgetItemComponent"
  ADD CONSTRAINT "BudgetItemComponent_referencePriceId_fkey"
  FOREIGN KEY ("referencePriceId") REFERENCES "CatalogItemPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- As linhas analíticas da composição de REFERÊNCIA copiadas para o item.
CREATE TABLE "BudgetItemReferenceComponent" (
  "id"           UUID                     NOT NULL,
  "budgetItemId" UUID                     NOT NULL,
  "position"     INTEGER                  NOT NULL,
  "section"      TEXT,
  "kind"         "ReferenceComponentKind" NOT NULL,
  "code"         TEXT                     NOT NULL,
  "description"  TEXT                     NOT NULL,
  "unit"         TEXT,
  "coefficient"  DECIMAL(18,7),
  "unitPrice"    DECIMAL(14,4),
  "totalCost"    DECIMAL(14,4),
  "situation"    TEXT,
  "metadata"     JSONB                    NOT NULL DEFAULT '{}',

  CONSTRAINT "BudgetItemReferenceComponent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BudgetItemReferenceComponent_budgetItemId_idx" ON "BudgetItemReferenceComponent" ("budgetItemId");

ALTER TABLE "BudgetItemReferenceComponent"
  ADD CONSTRAINT "BudgetItemReferenceComponent_budgetItemId_fkey"
  FOREIGN KEY ("budgetItemId") REFERENCES "BudgetItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BASES REFERENCIAIS: estrutura uma vez por competência, preço por UF e regime.
--
-- A estrutura (insumos, composições e as linhas de cada composição) de SINAPI e
-- SICRO é a mesma em todas as UFs de uma competência; só preço e custo mudam.
-- Guardar a base inteira por UF e regime ocupava ~32 MB cada (81 bases SINAPI
-- por mês). Com a separação, cada UF e regime guarda só a tabela de preços.
--
-- Esta migration RECRIA as tabelas de estrutura, que só existem vazias (nenhuma
-- base foi importada em ambiente nenhum). O bloco abaixo recusa rodar se houver
-- qualquer base importada ou item de orçamento apontando para ela: não há
-- conversão de dados aqui, e nada existente é apagado.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ReferenceDataset")
     OR EXISTS (SELECT 1 FROM "BudgetItem"
                 WHERE "referenceDatasetId" IS NOT NULL
                    OR "referenceItemId" IS NOT NULL
                    OR "referenceCompositionId" IS NOT NULL) THEN
    RAISE EXCEPTION 'Há bases referenciais importadas: esta migration só reestrutura tabelas vazias.';
  END IF;
END $$;

ALTER TABLE "BudgetItem" DROP CONSTRAINT "BudgetItem_referenceItemId_fkey";
ALTER TABLE "BudgetItem" DROP CONSTRAINT "BudgetItem_referenceCompositionId_fkey";

DROP TABLE "ReferenceCompositionItem";
DROP TABLE "ReferenceComposition";
DROP TABLE "ReferenceItem";

-- -----------------------------------------------------------------------------
-- EDIÇÃO: uma publicação (fonte + competência + rótulo de versão).
-- -----------------------------------------------------------------------------

CREATE TABLE "ReferenceEdition" (
  "id"            UUID              NOT NULL,
  "source"        "ReferenceSource" NOT NULL,
  "competence"    VARCHAR(7)        NOT NULL,
  "referenceDate" DATE              NOT NULL,
  "versionLabel"  TEXT              NOT NULL DEFAULT '',
  "createdAt"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReferenceEdition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReferenceEdition_competence_format" CHECK ("competence" ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

CREATE UNIQUE INDEX "ReferenceEdition_source_competence_versionLabel_key"
  ON "ReferenceEdition" ("source", "competence", "versionLabel");

-- A base (UF + regime) pertence a uma edição. A tabela está vazia (conferido
-- acima), então a coluna nasce NOT NULL.
ALTER TABLE "ReferenceDataset" ADD COLUMN "editionId" UUID NOT NULL;
CREATE INDEX "ReferenceDataset_editionId_idx" ON "ReferenceDataset" ("editionId");
ALTER TABLE "ReferenceDataset"
  ADD CONSTRAINT "ReferenceDataset_editionId_fkey"
  FOREIGN KEY ("editionId") REFERENCES "ReferenceEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- ESTRUTURA (por edição). `structureHash` permite a rara variação entre UFs:
-- mesmo código com estrutura diferente vira outra linha, e cada base aponta
-- para a sua pelo preço.
-- -----------------------------------------------------------------------------

CREATE TABLE "ReferenceItem" (
  "id"            UUID NOT NULL,
  "editionId"     UUID NOT NULL,
  "code"          TEXT NOT NULL,
  "description"   TEXT NOT NULL,
  "searchKey"     TEXT NOT NULL,
  "unit"          TEXT NOT NULL,
  "category"      TEXT,
  "structureHash" TEXT NOT NULL,

  CONSTRAINT "ReferenceItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferenceItem_editionId_code_structureHash_key"
  ON "ReferenceItem" ("editionId", "code", "structureHash");
CREATE INDEX "ReferenceItem_editionId_code_prefix_idx"      ON "ReferenceItem" ("editionId", "code" text_pattern_ops);
CREATE INDEX "ReferenceItem_editionId_searchKey_prefix_idx" ON "ReferenceItem" ("editionId", "searchKey" text_pattern_ops);
CREATE INDEX "ReferenceItem_searchKey_trgm_idx"             ON "ReferenceItem" USING GIN ("searchKey" gin_trgm_ops);

ALTER TABLE "ReferenceItem"
  ADD CONSTRAINT "ReferenceItem_editionId_fkey"
  FOREIGN KEY ("editionId") REFERENCES "ReferenceEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReferenceComposition" (
  "id"            UUID  NOT NULL,
  "editionId"     UUID  NOT NULL,
  "code"          TEXT  NOT NULL,
  "description"   TEXT  NOT NULL,
  "searchKey"     TEXT  NOT NULL,
  "unit"          TEXT  NOT NULL,
  "group"         TEXT,
  "metadata"      JSONB NOT NULL DEFAULT '{}',
  "structureHash" TEXT  NOT NULL,

  CONSTRAINT "ReferenceComposition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferenceComposition_editionId_code_structureHash_key"
  ON "ReferenceComposition" ("editionId", "code", "structureHash");
CREATE INDEX "ReferenceComposition_editionId_code_prefix_idx"      ON "ReferenceComposition" ("editionId", "code" text_pattern_ops);
CREATE INDEX "ReferenceComposition_editionId_searchKey_prefix_idx" ON "ReferenceComposition" ("editionId", "searchKey" text_pattern_ops);
CREATE INDEX "ReferenceComposition_searchKey_trgm_idx"             ON "ReferenceComposition" USING GIN ("searchKey" gin_trgm_ops);

ALTER TABLE "ReferenceComposition"
  ADD CONSTRAINT "ReferenceComposition_editionId_fkey"
  FOREIGN KEY ("editionId") REFERENCES "ReferenceEdition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- As linhas da composição, SEM preço: o preço de cada linha é recalculado da
-- base (UF + regime) — ver `reference-normalizer.ts`.
CREATE TABLE "ReferenceCompositionItem" (
  "id"            UUID                     NOT NULL,
  "compositionId" UUID                     NOT NULL,
  "position"      INTEGER                  NOT NULL,
  "section"       TEXT,
  "kind"          "ReferenceComponentKind" NOT NULL,
  "code"          TEXT                     NOT NULL,
  "description"   TEXT                     NOT NULL,
  "unit"          TEXT,
  "coefficient"   DECIMAL(18,7),
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
-- PREÇO (por base: UF + regime).
-- -----------------------------------------------------------------------------

CREATE TABLE "ReferenceItemPrice" (
  "datasetId" UUID          NOT NULL,
  "itemId"    UUID          NOT NULL,
  "unitPrice" DECIMAL(14,4),
  "metadata"  JSONB         NOT NULL DEFAULT '{}',

  CONSTRAINT "ReferenceItemPrice_pkey" PRIMARY KEY ("datasetId", "itemId"),
  CONSTRAINT "ReferenceItemPrice_unitPrice_not_negative" CHECK ("unitPrice" IS NULL OR "unitPrice" >= 0)
);

CREATE INDEX "ReferenceItemPrice_itemId_idx" ON "ReferenceItemPrice" ("itemId");

ALTER TABLE "ReferenceItemPrice"
  ADD CONSTRAINT "ReferenceItemPrice_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "ReferenceDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferenceItemPrice"
  ADD CONSTRAINT "ReferenceItemPrice_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "ReferenceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ReferenceCompositionPrice" (
  "datasetId"          UUID          NOT NULL,
  "compositionId"      UUID          NOT NULL,
  "unitCost"           DECIMAL(14,4),
  "situation"          TEXT,
  "metadata"           JSONB         NOT NULL DEFAULT '{}',
  -- Só o que a regra de recálculo não reproduz, por posição da linha.
  "componentOverrides" JSONB         NOT NULL DEFAULT '{}',

  CONSTRAINT "ReferenceCompositionPrice_pkey" PRIMARY KEY ("datasetId", "compositionId"),
  CONSTRAINT "ReferenceCompositionPrice_unitCost_not_negative" CHECK ("unitCost" IS NULL OR "unitCost" >= 0)
);

CREATE INDEX "ReferenceCompositionPrice_compositionId_idx" ON "ReferenceCompositionPrice" ("compositionId");

ALTER TABLE "ReferenceCompositionPrice"
  ADD CONSTRAINT "ReferenceCompositionPrice_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "ReferenceDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReferenceCompositionPrice"
  ADD CONSTRAINT "ReferenceCompositionPrice_compositionId_fkey"
  FOREIGN KEY ("compositionId") REFERENCES "ReferenceComposition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Orçamento: o rastreio volta a apontar para a estrutura (a base fica em
-- `referenceDatasetId`, que não mudou). O snapshot no item é o que vale.
-- -----------------------------------------------------------------------------

ALTER TABLE "BudgetItem"
  ADD CONSTRAINT "BudgetItem_referenceItemId_fkey"
  FOREIGN KEY ("referenceItemId") REFERENCES "ReferenceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BudgetItem"
  ADD CONSTRAINT "BudgetItem_referenceCompositionId_fkey"
  FOREIGN KEY ("referenceCompositionId") REFERENCES "ReferenceComposition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

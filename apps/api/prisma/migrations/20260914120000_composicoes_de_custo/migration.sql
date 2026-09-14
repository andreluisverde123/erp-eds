-- COMPOSIÇÕES DE CUSTO (ORC-02).
--
-- Quanto custa produzir UMA unidade de um serviço: "1 m² de alvenaria =
-- 25 blocos + 0,80 h de pedreiro + 0,10 h de betoneira".
--
-- Inteiramente aditiva:
--   * dois valores novos no enum de natureza do insumo;
--   * duas tabelas novas, que nascem vazias;
--   * duas permissões, com ON CONFLICT DO NOTHING.
--
-- Nenhuma linha existente é alterada. Todo `CatalogItem` gravado continua
-- `MATERIAL`, e nenhum `PurchaseRequestItem` é tocado.

-- NATUREZA DO INSUMO.
--
-- `ADD VALUE` é aditivo e não reescreve a tabela. Os valores novos não são
-- usados nesta migration — o Postgres não deixa usar um valor de enum na mesma
-- transação que o criou, e não há por que usar.
ALTER TYPE "CatalogItemType" ADD VALUE IF NOT EXISTS 'LABOR';
ALTER TYPE "CatalogItemType" ADD VALUE IF NOT EXISTS 'EQUIPMENT';

-- COMPOSIÇÃO.
--
-- Sem coluna de custo. O custo unitário é Σ (coeficiente × preço) dos itens e
-- é calculado a cada leitura, no backend. Uma coluna aqui seria um segundo
-- número para o mesmo fato, e o dia em que os dois divergissem ninguém saberia
-- qual está certo. Materializar só se justifica quando houver composição
-- dentro de composição (ORC-03) — e aí com recálculo explícito.
CREATE TABLE "Composition" (
  "id"          UUID         NOT NULL,
  "companyId"   UUID         NOT NULL,
  "code"        TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "searchKey"   TEXT         NOT NULL,
  "description" TEXT,
  "unit"        TEXT         NOT NULL,
  "active"      BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "deletedAt"   TIMESTAMP(3),

  CONSTRAINT "Composition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Composition_companyId_code_key" ON "Composition" ("companyId", "code");

CREATE INDEX "Composition_companyId_idx"        ON "Composition" ("companyId");
CREATE INDEX "Composition_companyId_active_idx" ON "Composition" ("companyId", "active");

-- Os mesmos índices de busca do catálogo de insumos: prefixo desde a primeira
-- letra, trecho no meio e código.
CREATE INDEX "Composition_searchKey_prefix_idx" ON "Composition" ("searchKey" text_pattern_ops);
CREATE INDEX "Composition_searchKey_trgm_idx"   ON "Composition" USING GIN ("searchKey" gin_trgm_ops);
CREATE INDEX "Composition_code_trgm_idx"        ON "Composition" USING GIN ("code" gin_trgm_ops);

ALTER TABLE "Composition"
  ADD CONSTRAINT "Composition_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ITEM DE COMPOSIÇÃO.
--
-- `coefficient` DECIMAL(14,6): coeficientes de base referencial chegam a seis
-- casas (0,000123 m³/m²). É a precisão nova que a auditoria de orçamento
-- apontou.
--
-- `unitPrice` DECIMAL(14,4): a mesma precisão de preço unitário fino que o
-- ERP já usa na NF-e e no contrato por unidade. O preço é DA COMPOSIÇÃO, não
-- do insumo — o catálogo continua sem preço.
--
-- Sem `totalCost`: é coeficiente × preço, derivado no backend.
--
-- Sem `companyId` próprio: o item pertence à composição, e a empresa é a dela.
-- É o padrão de `PurchaseRequestItem`.
CREATE TABLE "CompositionItem" (
  "id"            UUID           NOT NULL,
  "compositionId" UUID           NOT NULL,
  "catalogItemId" UUID           NOT NULL,
  "coefficient"   DECIMAL(14,6)  NOT NULL,
  "unitPrice"     DECIMAL(14,4)  NOT NULL,
  "createdAt"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)   NOT NULL,

  CONSTRAINT "CompositionItem_pkey" PRIMARY KEY ("id"),
  -- A API recusa antes, com mensagem. Estas são a última linha de defesa
  -- contra um coeficiente zero (item que não custa nada e não some) ou um
  -- preço negativo (que abateria o custo das outras linhas).
  CONSTRAINT "CompositionItem_coefficient_positive" CHECK ("coefficient" > 0),
  CONSTRAINT "CompositionItem_unitPrice_not_negative" CHECK ("unitPrice" >= 0)
);

-- O MESMO INSUMO UMA VEZ POR COMPOSIÇÃO. Duas linhas de "Pedreiro" na mesma
-- composição somariam certo, mas ninguém saberia qual editar, e a futura curva
-- ABC contaria o insumo duas vezes. Quem precisa de mais pedreiro aumenta o
-- coeficiente da linha que já existe.
CREATE UNIQUE INDEX "CompositionItem_compositionId_catalogItemId_key"
  ON "CompositionItem" ("compositionId", "catalogItemId");

CREATE INDEX "CompositionItem_catalogItemId_idx" ON "CompositionItem" ("catalogItemId");

-- CASCADE do lado da composição: o item não existe sem ela. Na prática nunca
-- dispara, porque composição é excluída logicamente.
ALTER TABLE "CompositionItem"
  ADD CONSTRAINT "CompositionItem_compositionId_fkey"
  FOREIGN KEY ("compositionId") REFERENCES "Composition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT do lado do insumo: a composição aponta para ele por identidade.
ALTER TABLE "CompositionItem"
  ADD CONSTRAINT "CompositionItem_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PERMISSÕES.
--
-- `composicoes.*`, separadas de `catalogo.*`, porque a composição carrega
-- PREÇO e o catálogo não. Compras consulta insumos para pedir material; isso
-- não deve abrir junto o custo que a engenharia orça.
--
-- `budget.*` / `orcamento.*` foram descartados pelo mesmo motivo do ORC-01: o
-- orçamento ainda não existe, e nomear a permissão por um módulo ausente
-- deixaria o nome errado no dia em que ele chegasse com permissões próprias.
INSERT INTO "Permission" ("id", "code", "module", "action", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'composicoes.view',   'composicoes', 'view',   'Consultar composições de custo e o custo unitário delas.', NOW(), NOW()),
  (gen_random_uuid(), 'composicoes.manage', 'composicoes', 'manage', 'Criar, editar e ativar composições, e manter os itens, coeficientes e preços.', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

-- Administração e Engenharia mantêm; Diretoria consulta.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), r."id", p."id", NOW(), NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('composicoes.view', 'composicoes.manage')
WHERE r."type" IN ('ADMIN', 'ENGINEER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), r."id", p."id", NOW(), NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" = 'composicoes.view'
WHERE r."type" = 'VIEWER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- CADASTRO DE INSUMOS (ORC-01).
--
-- A identidade que faltava. Até aqui o ERP não tinha cadastro de material: o
-- autocomplete de Compras lê o HISTÓRICO de `PurchaseRequestItem`, que é linha
-- de documento — a mesma "Cimento CP-II" existe em N linhas, sem id estável e
-- com unidade que varia entre elas.
--
-- Sem identidade de insumo, uma composição de orçamento ("13 blocos + 0,80 h de
-- pedreiro") não tem a que apontar. É por isso que este é o primeiro passo.
--
-- Inteiramente aditiva:
--   * uma tabela nova, que nasce vazia;
--   * uma coluna NULLABLE em `PurchaseRequestItem`;
--   * duas permissões, com ON CONFLICT DO NOTHING.
--
-- **NENHUM BACKFILL.** O histórico de solicitações NÃO vira catálogo
-- automaticamente, e a decisão é deliberada: as grafias divergem ("Cimento
-- CP-II", "cimento cp2", "CIMENTO CPII 50KG"), as unidades divergem entre
-- linhas do mesmo material, e materiais parecidos não são o mesmo material.
-- Inventar identidade retroativa produziria um catálogo que ninguém consegue
-- auditar. Aproveitar o histórico é assunto de seed assistido, com um humano
-- confirmando.

CREATE TYPE "CatalogItemType" AS ENUM ('MATERIAL');

CREATE TABLE "CatalogItem" (
  "id"          UUID              NOT NULL,
  "companyId"   UUID              NOT NULL,
  "code"        TEXT              NOT NULL,
  "name"        TEXT              NOT NULL,
  "searchKey"   TEXT              NOT NULL,
  "unit"        TEXT              NOT NULL,
  "category"    TEXT,
  "description" TEXT,
  "type"        "CatalogItemType" NOT NULL DEFAULT 'MATERIAL',
  "active"      BOOLEAN           NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3)      NOT NULL,
  "deletedAt"   TIMESTAMP(3),

  CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogItem_companyId_code_key" ON "CatalogItem" ("companyId", "code");

-- DUPLICIDADE. Determinística: mesmo nome normalizado na mesma empresa é o
-- mesmo insumo. Nada de similaridade — "Cimento CP-II" e "Cimento CP II"
-- continuam sendo dois cadastros, e quem decide se são o mesmo é o operador.
CREATE UNIQUE INDEX "CatalogItem_companyId_searchKey_key" ON "CatalogItem" ("companyId", "searchKey");

CREATE INDEX "CatalogItem_companyId_idx"        ON "CatalogItem" ("companyId");
CREATE INDEX "CatalogItem_companyId_active_idx" ON "CatalogItem" ("companyId", "active");

-- Os MESMOS dois índices do autocomplete de Compras. O btree com
-- `text_pattern_ops` serve o prefixo (`LIKE 'ci%'`), que o trigram não indexa
-- abaixo de três letras; o GIN trigram serve o trecho no meio.
CREATE INDEX "CatalogItem_searchKey_prefix_idx" ON "CatalogItem" ("searchKey" text_pattern_ops);
CREATE INDEX "CatalogItem_searchKey_trgm_idx"   ON "CatalogItem" USING GIN ("searchKey" gin_trgm_ops);
CREATE INDEX "CatalogItem_code_trgm_idx"        ON "CatalogItem" USING GIN ("code" gin_trgm_ops);

ALTER TABLE "CatalogItem"
  ADD CONSTRAINT "CatalogItem_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ÂNCORA DE IDENTIDADE na linha de solicitação.
--
-- Nullable e assim permanece: pedido de material fora do catálogo continua
-- válido. `description` e `unit` da linha NÃO mudam — o documento continua
-- dizendo o que dizia, e renomear o insumo no catálogo não reescreve
-- solicitação emitida.
--
-- `ON DELETE RESTRICT` porque o catálogo usa exclusão LÓGICA: o registro nunca
-- some da tabela, então a linha histórica nunca fica órfã e não há SET NULL a
-- executar.
ALTER TABLE "PurchaseRequestItem" ADD COLUMN "catalogItemId" UUID;

CREATE INDEX "PurchaseRequestItem_catalogItemId_idx" ON "PurchaseRequestItem" ("catalogItemId");

ALTER TABLE "PurchaseRequestItem"
  ADD CONSTRAINT "PurchaseRequestItem_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PERMISSÕES.
--
-- `catalogo.*` e não `engenharia.*`: o insumo é cadastro da EMPRESA, consumido
-- por Compras hoje e por Orçamento amanhã. Pendurá-lo em Engenharia diria que
-- é assunto de obra, e amarraria quem pode manter o catálogo a quem pode
-- cadastrar obra.
--
-- `budget.*` foi descartado pelo motivo oposto: orçamento ainda não existe, e
-- nomear a permissão por um módulo ausente deixaria o nome errado no dia em
-- que ele chegasse com permissões próprias.
INSERT INTO "Permission" ("id", "code", "module", "action", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'catalogo.view',   'catalogo', 'view',   'Consultar o cadastro de insumos da empresa.', NOW(), NOW()),
  (gen_random_uuid(), 'catalogo.manage', 'catalogo', 'manage', 'Cadastrar, editar, ativar e excluir insumos.', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

-- Administração recebe as duas; Engenharia mantém o catálogo (é quem conhece o
-- material da obra); Compras consulta.
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), r."id", p."id", NOW(), NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('catalogo.view', 'catalogo.manage')
WHERE r."type" IN ('ADMIN', 'ENGINEER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), r."id", p."id", NOW(), NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" = 'catalogo.view'
WHERE r."type" = 'BUYER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

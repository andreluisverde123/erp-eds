-- Materiais movimentados no RDO.
--
-- Aditiva: dois enums e uma tabela. Nada existente é alterado.
--
-- NÃO é estoque. Não há saldo, entrada fiscal, fornecedor, custo, almoxarifado
-- nem inventário — esses conceitos pertencem a Compras e Financeiro, que já os
-- têm. Aqui a pergunta é uma só: "o que aconteceu com os materiais na obra
-- hoje?". O histórico de uma obra se lê percorrendo os RDOs dela; nenhum
-- acumulado é mantido, e antecipar um criaria uma segunda verdade sobre o
-- estoque que o ERP modela em outro lugar.

-- Enum, e não texto livre como `PurchaseRequestItem.unit`. Lá o campo é String
-- porque o seed já havia gravado abreviações do setor antes de existir
-- catálogo, e enumerá-lo hoje exigiria migrar dado. Aqui a tabela nasce vazia:
-- dá para exigir um valor válido desde o primeiro registro, e passa a ser o
-- banco a recusar unidade inventada.
--
-- Os códigos que existem nos dois lugares são os MESMOS de `MEASUREMENT_UNITS`
-- (`apps/web/src/lib/measurement-units.ts`) — `SC`, `CX`, `PCT` e não
-- `SACO`/`CAIXA`/`PACOTE`. No dia em que alguém quiser abrir uma solicitação
-- de compra a partir do material faltante de um RDO, a unidade atravessa sem
-- tabela de tradução.
CREATE TYPE "MaterialUnit" AS ENUM (
    'UN', 'KG', 'TON', 'M', 'M2', 'M3', 'L', 'SC', 'CX', 'PCT', 'OTHER'
);

CREATE TYPE "MaterialMovementType" AS ENUM ('RECEIVED', 'USED', 'RETURNED', 'OTHER');

CREATE TABLE "DailyReportMaterial" (
    "id" UUID NOT NULL,
    "dailyReportId" UUID NOT NULL,
    -- `name`, e não `materialName`: as tabelas irmãs já chamam o campo de
    -- identificação de `name` (equipamento), `role` (função) e `description`
    -- (atividade). Repetir o nome do modelo dentro da coluna seria o único
    -- caso do schema.
    "name" TEXT NOT NULL,
    -- DECIMAL(12,3), o mesmo de `PurchaseRequestItem.quantity`. Decimal e não
    -- INTEGER porque 2,5 m³ de concreto e 150,75 kg de vergalhão são as
    -- quantidades normais de uma obra; e não DOUBLE porque quantidade que
    -- entra em medição não pode carregar erro binário.
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" "MaterialUnit" NOT NULL,
    "movementType" "MaterialMovementType" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReportMaterial_pkey" PRIMARY KEY ("id")
);

-- Sem unicidade por nome, ao contrário de `DailyReportLabor`: o mesmo material
-- aparece legitimamente duas vezes no mesmo dia quando parte foi recebida e
-- parte foi utilizada — são movimentações distintas, não engano.
CREATE INDEX "DailyReportMaterial_dailyReportId_idx" ON "DailyReportMaterial"("dailyReportId");

-- ON DELETE CASCADE e sem `deletedAt`, como as outras quatro listas do RDO
-- (ver a migration `20260830190000_rdo_conteudo_operacional`): o registro não
-- existe sem o relatório, e a exclusão de um item é definitiva. O soft delete
-- vive no documento, que é o que precisa ser recuperável.
ALTER TABLE "DailyReportMaterial"
    ADD CONSTRAINT "DailyReportMaterial_dailyReportId_fkey"
    FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

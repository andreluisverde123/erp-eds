-- A solicitação de compra passa a escolher a obra, e o centro de custo vira
-- opcional.
--
-- Inverte a relação anterior: `constructionSiteId` era DERIVADO do centro de
-- custo (o solicitante escolhia a conta contábil e a obra saía por tabela).
-- Agora a obra é o campo primário e obrigatório, e o centro de custo é
-- preenchido por quem souber — o solicitante ou, na emissão da Ordem de
-- Compra, o setor de Compras.
--
-- Nenhuma linha é apagada e nenhuma coluna é removida.
--
-- A ordem abaixo importa. `constructionSiteId` nasceu anulável e pode conter
-- nulos legítimos (solicitações cujo centro de custo não pertencia a obra
-- nenhuma — Escritório, Fazenda). Fazê-lo NOT NULL direto falharia nessas
-- bases, e é por isso que o backfill e a trava vêm antes.

-- 1. Backfill: puxa a obra do centro de custo, que é exatamente o que o
--    service fazia em tempo de execução até aqui.
UPDATE "PurchaseRequest" AS pr
SET "constructionSiteId" = cc."constructionSiteId"
FROM "CostCenter" AS cc
WHERE pr."costCenterId" = cc."id"
  AND pr."constructionSiteId" IS NULL
  AND cc."constructionSiteId" IS NOT NULL;

-- 2. Trava. Sobra nulo quando a solicitação apontava para um centro de custo
--    sem obra — dado legítimo no modelo antigo e impossível no novo. Não há
--    valor que a migration possa inventar aqui (escolher uma obra qualquer
--    falsificaria a atribuição de custo), então ela para e devolve a decisão
--    a quem conhece esses registros.
DO $$
DECLARE sem_obra INTEGER;
BEGIN
  SELECT count(*) INTO sem_obra FROM "PurchaseRequest" WHERE "constructionSiteId" IS NULL;
  IF sem_obra > 0 THEN
    RAISE EXCEPTION
      'Há % solicitação(ões) sem obra — vinham de centro de custo não ligado a obra. Atribua uma obra a elas (ou apague-as, se forem descartáveis) e rode a migration de novo. Nada foi alterado.',
      sem_obra;
  END IF;
END $$;

-- 3. A obra passa a ser obrigatória.
ALTER TABLE "PurchaseRequest" ALTER COLUMN "constructionSiteId" SET NOT NULL;

-- 4. O centro de custo deixa de ser.
ALTER TABLE "PurchaseRequest" ALTER COLUMN "costCenterId" DROP NOT NULL;

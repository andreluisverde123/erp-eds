-- O responsável pela obra passa a ser um USUÁRIO, e não só um nome digitado.
--
-- É o que dá a ele a obra no Diário: escolher o responsável cria o vínculo em
-- `UserConstructionSite`, sem uma segunda tela. Era a lacuna que fazia uma
-- obra recém-cadastrada não aparecer para ninguém.
--
-- `responsibleName` CONTINUA existindo ao lado, e não é derivado do usuário:
-- as obras cadastradas antes disto têm um nome digitado e nenhum usuário, e
-- os documentos já emitidos citam o responsável pelo nome que valia na época.
ALTER TABLE "ConstructionSite" ADD COLUMN "responsibleId" UUID;

ALTER TABLE "ConstructionSite"
  ADD CONSTRAINT "ConstructionSite_responsibleId_fkey"
  FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ConstructionSite_responsibleId_idx" ON "ConstructionSite"("responsibleId");

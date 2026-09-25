-- Nota de serviço de terceirizado: a Engenharia lança pela tela de
-- Terceirizados a nota de um serviço (com ou sem contrato), que vira conta a
-- pagar e segue para a liberação na Programação de Pagamentos. Só colunas
-- novas e anuláveis: nenhuma conta existente muda.
ALTER TABLE "AccountPayable"
  ADD COLUMN "contractorId" UUID,
  ADD COLUMN "launchedById" UUID;

ALTER TABLE "AccountPayable"
  ADD CONSTRAINT "AccountPayable_contractorId_fkey"
  FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountPayable"
  ADD CONSTRAINT "AccountPayable_launchedById_fkey"
  FOREIGN KEY ("launchedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AccountPayable_contractorId_idx" ON "AccountPayable"("contractorId");

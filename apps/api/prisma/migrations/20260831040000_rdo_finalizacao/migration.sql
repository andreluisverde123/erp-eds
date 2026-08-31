-- Finalização do RDO: quando o relatório foi fechado, e por quem.
--
-- Aditiva: duas colunas anuláveis, um índice e uma FK. Nenhum enum muda —
-- `DailyReportStatus` já tinha os valores necessários, e a transição
-- implementada é `DRAFT -> SUBMITTED`. Nenhum estado novo foi criado.
--
-- (`APPROVED` continua no enum como o degrau da conferência pelo
-- fiscal/contratante, que ainda não existe e não é alcançável por rota
-- nenhuma. Não existe estado "em revisão": um estado intermediário só se
-- justifica quando alguém age sobre ele, e enquanto a aprovação não existir
-- ele seria um beco de onde o relatório não sairia.)

-- `createdAt` não serve para representar finalização: um RDO aberto às 7h e
-- finalizado às 17h tem dois instantes distintos, e o documento precisa dizer
-- quando foi FECHADO, não quando foi aberto.
--
-- Nulos enquanto o relatório é rascunho. É essa nulidade que responde "já foi
-- entregue?" sem depender de o enum estar correto — e é por isso que os dois
-- são preenchidos SÓ na transição, nunca na criação e nunca por um PATCH.
ALTER TABLE "DailyReport"
    ADD COLUMN "submittedAt" TIMESTAMP(3),
    ADD COLUMN "submittedById" UUID;

CREATE INDEX "DailyReport_submittedById_idx" ON "DailyReport"("submittedById");

-- SET NULL, e não RESTRICT como em `createdById`: a autoria do relatório é
-- parte do documento e não pode sumir com o usuário, mas quem apertou o botão
-- de finalizar é rastro operacional — o registro da finalização permanece na
-- auditoria (`AuditLog`), que guarda o autor de forma independente.
ALTER TABLE "DailyReport"
    ADD CONSTRAINT "DailyReport_submittedById_fkey"
    FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

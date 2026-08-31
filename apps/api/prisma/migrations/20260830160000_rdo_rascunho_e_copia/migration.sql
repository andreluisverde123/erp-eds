-- Ciclo de vida do RDO: rascunho editável, salvamento incremental e cópia.
--
-- Aditiva: duas colunas novas (ambas anuláveis) e uma constraint. Nenhuma
-- coluna alterada, nenhuma removida, nenhuma linha reescrita.

-- Observações gerais do dia — PRIMEIRO campo de conteúdo do RDO, e por
-- enquanto o único. Clima, mão de obra, equipamentos, atividades, ocorrências,
-- materiais, fotos e vídeos são as etapas seguintes e entram como tabelas
-- próprias, sem tocar nesta.
--
-- Existe agora porque o salvamento incremental precisa de algo real para
-- salvar: uma infraestrutura de autosave sem nenhum campo que a exercite não é
-- infraestrutura, é código que nunca rodou.
ALTER TABLE "DailyReport" ADD COLUMN "notes" TEXT;

-- Procedência da cópia. Responde "de onde veio este RDO" sem depender da
-- auditoria, e é o que permite a tela dizer "copiado do RDO #23".
ALTER TABLE "DailyReport" ADD COLUMN "copiedFromId" UUID;

CREATE INDEX "DailyReport_copiedFromId_idx" ON "DailyReport"("copiedFromId");

-- ON DELETE SET NULL: apagar o relatório de origem não pode derrubar as
-- cópias junto — elas são documentos independentes desde o instante em que
-- foram criadas. Perde-se o rastro da procedência, não o relatório.
ALTER TABLE "DailyReport"
    ADD CONSTRAINT "DailyReport_copiedFromId_fkey"
    FOREIGN KEY ("copiedFromId") REFERENCES "DailyReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- UM relatório por obra por dia.
--
-- A regra não foi inventada aqui: o modelo já a afirmava em três lugares — o
-- nome (relatório DIÁRIO de obra), o tipo da coluna (`DATE`, sem hora) e a
-- numeração sequencial por obra. O que faltava era o banco impedir. Sem a
-- constraint, dois toques no botão de criar produzem dois RDOs para a mesma
-- data, e a segunda pessoa a preencher só descobre quando o dia já passou.
--
-- Ela é também a rede de segurança da concorrência: mesmo que o lock consultivo
-- da geração de número falhe por qualquer motivo, o banco recusa o duplicado.
--
-- ATENÇÃO para quem for implementar exclusão de RDO: esta constraint NÃO ignora
-- `deletedAt`. Um relatório excluído em soft delete bloquearia recriar aquela
-- data. Hoje não existe exclusão de RDO, então a situação não acontece — quando
-- existir, a decisão é entre um índice parcial (`WHERE "deletedAt" IS NULL`,
-- que o Prisma não expressa no schema e passaria a acusar drift) e exclusão
-- definitiva.
CREATE UNIQUE INDEX "DailyReport_constructionSiteId_reportDate_key"
    ON "DailyReport"("constructionSiteId", "reportDate");

-- O índice comum em (constructionSiteId, reportDate), criado na migration da
-- fundação, virou redundante: o índice ÚNICO acima cobre exatamente as mesmas
-- consultas ("os últimos relatórios das minhas obras", filtro por obra +
-- ordenação por data). Manter os dois pagaria escrita dobrada sem ganho de
-- leitura nenhum.
DROP INDEX "DailyReport_constructionSiteId_reportDate_idx";

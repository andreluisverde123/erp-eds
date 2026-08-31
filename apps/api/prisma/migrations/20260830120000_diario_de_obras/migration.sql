-- Fundação do Diário de Obras: vínculo usuário↔obra e o esqueleto do RDO.
--
-- Inteiramente ADITIVA. Nenhuma tabela, coluna ou linha existente é alterada
-- ou removida — o ERP que roda hoje continua idêntico depois de aplicar isto.
--
-- Por que a tabela de vínculo precisou nascer: até aqui NENHUMA relação ligava
-- `User` a `ConstructionSite`. A que existe, `EmployeeAllocation`, liga a obra
-- ao `Employee` (colaborador do RH — a maioria não tem login no sistema), e o
-- próprio schema documenta que `User` e `Employee` são entidades distintas de
-- propósito. Sem `UserConstructionSite`, a regra "o engenheiro A não enxerga a
-- obra do engenheiro B" não teria como ser respondida pelo backend, e o
-- isolamento por obra viraria decoração de interface.

-- `SITE_INSPECTOR` = fiscal DE OBRA (quem acompanha a execução em campo pelo
-- contratante). Nada a ver com o módulo `fiscal` do código, que é tributário.
-- ADD VALUE é aditivo: papéis já gravados continuam válidos. Roda dentro da
-- transação da migration sem problema (permitido desde o Postgres 12) porque
-- o valor novo não é USADO aqui — quem grava um papel `SITE_INSPECTOR` é o
-- seed, depois do commit, e é justamente isso que o Postgres proíbe fazer na
-- mesma transação.
ALTER TYPE "UserRoleType" ADD VALUE 'SITE_INSPECTOR';

-- Papel DENTRO da obra — quem assina o diário como responsável técnico e quem
-- assina como fiscal. Não substitui o RBAC: `Role` decide o que a pessoa pode
-- FAZER no sistema; isto decide como ela aparece NAQUELA obra. A mesma pessoa
-- pode ser engenheira numa obra e fiscal em outra.
CREATE TYPE "SiteAssignmentRole" AS ENUM ('ENGINEER', 'INSPECTOR');

CREATE TYPE "DailyReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');

CREATE TABLE "UserConstructionSite" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "constructionSiteId" UUID NOT NULL,
    "role" "SiteAssignmentRole" NOT NULL DEFAULT 'ENGINEER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserConstructionSite_pkey" PRIMARY KEY ("id")
);

-- Sem `companyId` de propósito: a obra já tem uma, e uma segunda cópia aqui
-- permitiria gravar um vínculo entre usuário de uma empresa e obra de outra
-- sem que nenhuma constraint reclamasse. O cruzamento é feito pela obra.
CREATE UNIQUE INDEX "UserConstructionSite_userId_constructionSiteId_key"
    ON "UserConstructionSite"("userId", "constructionSiteId");
CREATE INDEX "UserConstructionSite_constructionSiteId_idx"
    ON "UserConstructionSite"("constructionSiteId");

ALTER TABLE "UserConstructionSite"
    ADD CONSTRAINT "UserConstructionSite_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserConstructionSite"
    ADD CONSTRAINT "UserConstructionSite_constructionSiteId_fkey"
    FOREIGN KEY ("constructionSiteId") REFERENCES "ConstructionSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Esqueleto do RDO: só identidade e vínculo (obra, data, número, autor,
-- situação). Clima, mão de obra, equipamentos, atividades, ocorrências,
-- materiais, fotos, vídeos, PDF e assinaturas são as etapas seguintes e entram
-- como tabelas/colunas próprias, sem mexer nesta.
--
-- Ele nasce agora, e não junto do preenchimento, porque o controle de acesso
-- precisa de algo para proteger: "não consigo ler o RDO de uma obra que não é
-- minha" só é verificável se o RDO existir como tabela.
CREATE TABLE "DailyReport" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "constructionSiteId" UUID NOT NULL,
    -- Sequencial POR OBRA, não global: em campo é "o RDO 24 da Aurora".
    "number" INTEGER NOT NULL,
    "reportDate" DATE NOT NULL,
    "status" "DailyReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyReport_constructionSiteId_number_key"
    ON "DailyReport"("constructionSiteId", "number");
CREATE INDEX "DailyReport_companyId_idx" ON "DailyReport"("companyId");
-- "Os últimos relatórios das minhas obras" (Home do Diário) é exatamente esta
-- consulta: filtra por obra, ordena por data decrescente.
CREATE INDEX "DailyReport_constructionSiteId_reportDate_idx"
    ON "DailyReport"("constructionSiteId", "reportDate");
CREATE INDEX "DailyReport_createdById_idx" ON "DailyReport"("createdById");

ALTER TABLE "DailyReport"
    ADD CONSTRAINT "DailyReport_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyReport"
    ADD CONSTRAINT "DailyReport_constructionSiteId_fkey"
    FOREIGN KEY ("constructionSiteId") REFERENCES "ConstructionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyReport"
    ADD CONSTRAINT "DailyReport_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

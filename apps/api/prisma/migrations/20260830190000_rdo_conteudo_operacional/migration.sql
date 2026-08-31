-- Conteúdo operacional do RDO: horário, clima, mão de obra, equipamentos,
-- atividades e ocorrências.
--
-- Aditiva. Oito colunas novas em `DailyReport` (todas anuláveis), dois enums e
-- quatro tabelas. Nenhuma coluna existente é alterada ou removida, e nenhuma
-- linha é reescrita — o RDO que existe hoje continua válido, apenas vazio nas
-- seções novas.

-- Condição do tempo. Enumerado, e não texto livre, porque o clima do RDO vira
-- estatística: "quantos dias de chuva esta obra teve em março" é pergunta de
-- medição contratual, e ela não se responde sobre uma coluna onde cabem
-- "chuva", "Chuvoso", "chuva forte" e um emoji.
CREATE TYPE "WeatherCondition" AS ENUM ('SUNNY', 'PARTLY_CLOUDY', 'CLOUDY', 'RAIN', 'STORM');

-- Dez valores, e não trinta: o objetivo é filtrar e contar, não descrever. O
-- detalhe vive na descrição, que é texto livre — uma taxonomia grande demais
-- faz todo mundo escolher "Outro".
CREATE TYPE "OccurrenceType" AS ENUM (
    'MATERIAL', 'LABOR', 'EQUIPMENT', 'WEATHER', 'DESIGN',
    'SAFETY', 'SCHEDULE', 'INSPECTION', 'STOPPAGE', 'OTHER'
);

-- Horário de trabalho em MINUTOS desde a meia-noite (0–1439), e não TIME nem
-- TIMESTAMP. Um horário de expediente não tem data nem fuso: "07:00" é sete da
-- manhã na obra, e guardá-lo como timestamp obrigaria a inventar um dia e um
-- fuso que não significam nada — e a errar em uma hora quando o servidor
-- mudasse de zona. `TimeEntry`, no RH, usa timestamp porque lá o valor É um
-- instante (a batida do ponto); aqui é uma hora do relógio.
--
-- Todos anuláveis de propósito: o RDO é preenchido ao longo do dia, e exigir o
-- horário de término às 9h da manhã travaria o resto da tela.
ALTER TABLE "DailyReport"
    ADD COLUMN "workStartMinutes" INTEGER,
    ADD COLUMN "workBreakStartMinutes" INTEGER,
    ADD COLUMN "workBreakEndMinutes" INTEGER,
    ADD COLUMN "workEndMinutes" INTEGER,
    ADD COLUMN "scheduleNotes" TEXT,
    -- Clima em duas colunas, e não numa tabela filha com uma linha por período:
    -- são exatamente dois períodos, fixos, um por relatório. Uma tabela 1:1
    -- seria um join comprado sem nada em troca — e o PATCH do autosave, que já
    -- existe para `notes`, passa a cobrir clima sem mecanismo novo.
    ADD COLUMN "morningWeather" "WeatherCondition",
    ADD COLUMN "afternoonWeather" "WeatherCondition",
    ADD COLUMN "weatherNotes" TEXT;

-- Efetivo por função. NÃO há coluna de total: o total é a soma das linhas, e
-- guardá-lo criaria dois números para a mesma verdade, o segundo ficando
-- errado no primeiro item editado.
CREATE TABLE "DailyReportLabor" (
    "id" UUID NOT NULL,
    "dailyReportId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReportLabor_pkey" PRIMARY KEY ("id")
);

-- A mesma função duas vezes no mesmo dia é sempre engano: "Pedreiro 8" e
-- "Pedreiro 3" deveriam ser "Pedreiro 11". A constraint transforma o engano em
-- erro na hora, em vez de num total silenciosamente certo e numa lista confusa.
CREATE UNIQUE INDEX "DailyReportLabor_dailyReportId_role_key"
    ON "DailyReportLabor"("dailyReportId", "role");
CREATE INDEX "DailyReportLabor_dailyReportId_idx" ON "DailyReportLabor"("dailyReportId");

CREATE TABLE "DailyReportEquipment" (
    "id" UUID NOT NULL,
    "dailyReportId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    -- Situação naquele dia ("em manutenção"). É o que torna legítimo o mesmo
    -- equipamento aparecer duas vezes — um operando, outro parado —, e por isso
    -- aqui NÃO há a constraint de unicidade que a mão de obra tem.
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReportEquipment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DailyReportEquipment_dailyReportId_idx" ON "DailyReportEquipment"("dailyReportId");

CREATE TABLE "DailyReportActivity" (
    "id" UUID NOT NULL,
    "dailyReportId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    -- Ordem de exibição. Existe desde já para que reordenar seja depois um
    -- UPDATE de coluna, e não uma migration com backfill num RDO já assinado.
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReportActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DailyReportActivity_dailyReportId_position_idx"
    ON "DailyReportActivity"("dailyReportId", "position");

CREATE TABLE "DailyReportOccurrence" (
    "id" UUID NOT NULL,
    "dailyReportId" UUID NOT NULL,
    "type" "OccurrenceType" NOT NULL,
    "description" TEXT NOT NULL,
    -- Hora do acontecimento, em minutos desde a meia-noite. OPCIONAL: "chuva
    -- intensa durante a tarde" é registro legítimo e não tem hora. Exigi-la
    -- faria o usuário inventar uma.
    "occurredAtMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReportOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DailyReportOccurrence_dailyReportId_idx"
    ON "DailyReportOccurrence"("dailyReportId");

-- ON DELETE CASCADE nas quatro, seguindo o padrão que o sistema já usa para
-- item de documento (`PurchaseRequestItem` → `PurchaseRequest`): estas linhas
-- não existem sem o relatório, e um RDO apagado não pode deixar mão de obra e
-- atividades órfãs no banco.
--
-- Elas não têm `deletedAt`: exclusão de item de RDO é definitiva, como já é a
-- de item de solicitação de compra. O soft delete existe no documento, que é o
-- que precisa ser recuperável — não em cada linha dentro dele.
ALTER TABLE "DailyReportLabor"
    ADD CONSTRAINT "DailyReportLabor_dailyReportId_fkey"
    FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyReportEquipment"
    ADD CONSTRAINT "DailyReportEquipment_dailyReportId_fkey"
    FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyReportActivity"
    ADD CONSTRAINT "DailyReportActivity_dailyReportId_fkey"
    FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyReportOccurrence"
    ADD CONSTRAINT "DailyReportOccurrence_dailyReportId_fkey"
    FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

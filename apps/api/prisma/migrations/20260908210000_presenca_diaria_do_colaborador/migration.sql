-- PRESENÇA DIÁRIA DO COLABORADOR (RH-03).
--
-- Tabela nova, e a auditoria explica por que nenhuma das três existentes servia:
--
--   * `TimeEntry` é controle de JORNADA. Seu `status` é derivado de
--     checkIn/checkOut, então um registro só de presença ficaria `OPEN` para
--     sempre — que a tela de Ponto exibe como "Aberto", ponto por fechar. E o
--     `constructionSiteId` de lá é opcional; presença sem obra não responde à
--     pergunta.
--   * `ProductionEntry` é produção: `description`, `quantity` e `unit` são
--     obrigatórios e teriam de ser inventados.
--   * `DailyReportLabor` é agregado por função ("4 pedreiros"), sem vínculo com
--     `Employee`, e some junto com o RDO.
--
-- Inteiramente aditiva: nenhuma tabela existente é tocada, nenhum registro é
-- reinterpretado e não há backfill. Presença começa vazia, porque antes desta
-- migration ela simplesmente não era registrada em lugar nenhum.
--
-- Sem `deletedAt` de propósito: corrigir um apontamento é trocar `present`, não
-- excluir a linha. Isso também evita o conflito clássico entre exclusão lógica
-- e chave única — com soft delete, reapontar o mesmo dia esbarraria na linha
-- apagada.
CREATE TABLE "EmployeeAttendance" (
  -- Sem DEFAULT no banco: o id vem do Prisma (`@default(uuid())` é gerado no
  -- cliente). É a convenção de toda tabela deste schema, e um default aqui
  -- seria divergência que nunca chegaria a ser usada.
  "id"                 UUID         NOT NULL,
  "employeeId"         UUID         NOT NULL,
  "constructionSiteId" UUID         NOT NULL,
  "date"               DATE         NOT NULL,
  "present"            BOOLEAN      NOT NULL DEFAULT true,
  "notes"              TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmployeeAttendance_pkey" PRIMARY KEY ("id")
);

-- Uma pessoa, um dia, um registro. A obra fica FORA da chave de propósito: com
-- ela, a mesma pessoa poderia constar presente em duas obras no mesmo dia e as
-- duas linhas seriam válidas. É esta constraint que torna a gravação um
-- `upsert` idempotente e resolve a concorrência entre dois responsáveis
-- salvando o mesmo dia.
CREATE UNIQUE INDEX "EmployeeAttendance_employeeId_date_key"
  ON "EmployeeAttendance" ("employeeId", "date");

CREATE INDEX "EmployeeAttendance_constructionSiteId_date_idx"
  ON "EmployeeAttendance" ("constructionSiteId", "date");

CREATE INDEX "EmployeeAttendance_employeeId_date_idx"
  ON "EmployeeAttendance" ("employeeId", "date");

ALTER TABLE "EmployeeAttendance"
  ADD CONSTRAINT "EmployeeAttendance_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EmployeeAttendance"
  ADD CONSTRAINT "EmployeeAttendance_constructionSiteId_fkey"
  FOREIGN KEY ("constructionSiteId") REFERENCES "ConstructionSite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

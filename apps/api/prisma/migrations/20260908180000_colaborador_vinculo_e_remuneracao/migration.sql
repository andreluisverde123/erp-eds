-- VÍNCULO E REMUNERAÇÃO DO COLABORADOR (RH-01).
--
-- `Employee` já era o cadastro canônico de colaborador — independente de
-- `User`, com status, soft delete, auditoria e alocação por período. Faltavam
-- só três informações para ele distinguir os casos que a obra tem de verdade:
-- se o vínculo é próprio ou terceirizado, se a remuneração é mensal ou por
-- diária, e quanto vale essa diária.
--
-- Inteiramente aditiva. Os defaults descrevem o que toda linha existente já é
-- — mão de obra própria, CLT — então nenhum registro é alterado e nenhuma
-- consulta atual muda de resultado.
--
-- `dailyRate` fica nulo em todas as linhas existentes, que é o correto: elas
-- são CLT, e CLT não tem diária.
CREATE TYPE "EmploymentType" AS ENUM ('OWN', 'OUTSOURCED');
CREATE TYPE "CompensationType" AS ENUM ('CLT', 'DAILY');

ALTER TABLE "Employee"
  ADD COLUMN "employmentType" "EmploymentType" NOT NULL DEFAULT 'OWN',
  ADD COLUMN "compensationType" "CompensationType" NOT NULL DEFAULT 'CLT',
  ADD COLUMN "dailyRate" DECIMAL(14,2);

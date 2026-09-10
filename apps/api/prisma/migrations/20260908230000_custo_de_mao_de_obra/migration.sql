-- CUSTO DE MÃO DE OBRA (RH-04).
--
-- Três acréscimos, todos opcionais, e o princípio é o mesmo nos três: NULL
-- significa DESCONHECIDO, nunca zero. Nenhum backfill — o custo do passado que
-- não pode ser comprovado permanece desconhecido, e o relatório diz isso em vez
-- de exibir um valor convincente e errado.

-- 1. SNAPSHOT DA DIÁRIA.
--
-- `Employee.dailyRate` guarda um valor só, sem vigência. Sem congelar a diária
-- no apontamento, reajustá-la em outubro recalcularia setembro em silêncio.
-- Apontamentos já gravados ficam NULL: não há como comprovar qual diária valia
-- no dia, e inventá-la seria pior que admitir o desconhecido.
ALTER TABLE "EmployeeAttendance"
  ADD COLUMN "dailyRateApplied" DECIMAL(14,2);

-- 2. CUSTO DO EMPREGADOR NO HOLERITE.
--
-- `Payslip.deductions` são descontos DO EMPREGADO (INSS e IRRF retidos), já
-- contidos no `grossSalary`. O que a empresa paga ALÉM do bruto não existia em
-- lugar nenhum do ERP. Estas três colunas são o lugar — valores efetivos,
-- lançados por quem tem a folha em mãos. O ERP não calcula percentual legal
-- nenhum e não vai inventar encargo.
--
-- `provisions` é mensal de propósito: a proporcionalidade de 13º e férias que o
-- negócio pediu sai de graça, porque cada mês carrega a sua fração e é rateado
-- junto com os dias daquele mês.
ALTER TABLE "Payslip"
  ADD COLUMN "employerCharges" DECIMAL(14,2),
  ADD COLUMN "benefits"        DECIMAL(14,2),
  ADD COLUMN "provisions"      DECIMAL(14,2);

-- 3. PRECIFICAÇÃO DA EMPREITADA.
--
-- `GLOBAL` como default descreve exatamente todo contrato já cadastrado: eles
-- têm `totalValue` e nada mais. Nenhuma linha existente muda de significado.
CREATE TYPE "ContractPricingType" AS ENUM ('GLOBAL', 'UNIT');

ALTER TABLE "ContractorContract"
  ADD COLUMN "pricingType"      "ContractPricingType" NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN "unitPrice"        DECIMAL(14,4),
  ADD COLUMN "unitLabel"        TEXT,
  ADD COLUMN "measuredQuantity" DECIMAL(14,3);

-- Número do primeiro RDO da obra no Diário, para obras que já tinham diários
-- em outro sistema. Nulo nas obras existentes: a numeração continua em 1.
ALTER TABLE "ConstructionSite" ADD COLUMN "firstReportNumber" INTEGER;

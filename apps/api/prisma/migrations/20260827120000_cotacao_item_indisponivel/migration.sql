-- A cotação passa a aceitar item que o fornecedor NÃO TEM.
--
-- Até aqui, cotar era preencher o valor unitário de cada linha da solicitação,
-- e o único jeito de dizer "esse item não achei" era deixar o preço em branco
-- — indistinguível de "ainda não cotei" — ou digitar zero, que o resto do
-- sistema lê como brinde/bonificação. As duas leituras entram no total como
-- zero e desaparecem do relatório.
--
-- `unavailable` é o terceiro estado que faltava. Item marcado assim fica sem
-- preço, fora do total estimado, e continua íntegro na solicitação: a mesma
-- linha pode ser comprada de outro fornecedor depois.
--
-- Aditiva e reversível: duas colunas novas, nenhuma linha alterada. O default
-- `false` deixa toda solicitação existente exatamente como estava — nada era
-- indisponível antes porque não havia como marcar.

ALTER TABLE "PurchaseRequestItem"
  ADD COLUMN "unavailable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "unavailabilityNote" TEXT;

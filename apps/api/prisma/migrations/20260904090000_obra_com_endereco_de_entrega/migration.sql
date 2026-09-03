-- ENDEREÇO DE ENTREGA DA OBRA.
--
-- `addressLine`, `city`, `state` e `zipCode` já existiam na tabela, mas o
-- formulário só expunha cidade e UF — o endereço nunca chegava a ser
-- preenchido. Faltavam também os campos sem os quais um endereço brasileiro
-- não localiza nada: número, complemento e bairro.
--
-- Motivação: a ordem de compra vai ao fornecedor e precisa dizer onde
-- descarregar o material.
--
-- Todos opcionais. As obras já cadastradas continuam válidas e sem endereço;
-- nenhuma linha existente é alterada.
ALTER TABLE "ConstructionSite"
  ADD COLUMN "addressNumber" TEXT,
  ADD COLUMN "addressComplement" TEXT,
  ADD COLUMN "neighborhood" TEXT;

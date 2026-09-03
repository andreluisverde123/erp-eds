-- AUTOCOMPLETE DE INSUMO A PARTIR DA PRIMEIRA LETRA.
--
-- Antes, a sugestão fazia `ILIKE '%termo%'` sobre `description` apoiada num
-- índice trigram. Isso tem dois limites que só aparecem em uso real:
--
--   1. trigram NÃO indexa padrão com menos de três caracteres. Nas duas
--      primeiras teclas — as mais digitadas — o planejador caía em varredura
--      sequencial da tabela inteira. Era por isso que a busca só começava na
--      segunda letra: não por decisão de produto, mas porque a primeira era
--      cara.
--   2. `ILIKE` compara com acento. "cimento" não achava "Cimento Cola" se
--      alguém tivesse digitado "Cimentô", e "concreto" não achava "Concretô".
--
-- A coluna `searchKey` guarda a descrição já normalizada (minúscula, sem
-- acento, sem espaço nas pontas) e recebe DOIS índices, um para cada tipo de
-- busca. Ver a nota no schema.
--
-- `description` NÃO é tocada: continua sendo o que a pessoa digitou e o que o
-- documento imprime. `searchKey` é derivada dela.

ALTER TABLE "PurchaseRequestItem"
  ADD COLUMN "searchKey" TEXT NOT NULL DEFAULT '';

-- Backfill do que já existe. `translate` é IMMUTABLE e cobre o português sem
-- exigir a extensão `unaccent` — que não é immutable e, por isso, nem poderia
-- ser usada num índice sem uma função-invólucro própria.
--
-- Precisa produzir EXATAMENTE o mesmo texto que `normalizeForSearch` no
-- backend, senão as linhas antigas ficariam inalcançáveis pela busca das
-- novas. Há teste travando as duas contas juntas.
UPDATE "PurchaseRequestItem"
   SET "searchKey" = btrim(
         translate(
           lower("description"),
           'áàâãäéèêëíìîïóòôõöúùûüçñ',
           'aaaaaeeeeiiiiooooouuuucn'
         )
       );

-- PREFIXO ("ci" -> "Cimento CP II"), e é este que faz a primeira letra
-- responder. `text_pattern_ops` porque, com collation diferente de C, o `LIKE`
-- só usa o índice com esta classe de operadores.
CREATE INDEX "PurchaseRequestItem_searchKey_prefix_idx"
  ON "PurchaseRequestItem" ("searchKey" text_pattern_ops);

-- TRECHO NO MEIO ("mento" -> "Cimento"). Vale de três caracteres em diante;
-- abaixo disso quem responde é o índice de prefixo acima.
CREATE INDEX "PurchaseRequestItem_searchKey_trgm_idx"
  ON "PurchaseRequestItem" USING GIN ("searchKey" gin_trgm_ops);

-- O índice antigo sai: a sugestão era seu ÚNICO consumidor (é o que a própria
-- migration que o criou dizia), e ela passou a consultar `searchKey`. Um GIN
-- órfão continuaria cobrando escrita em toda linha de toda solicitação, sem
-- nenhuma leitura em troca.
DROP INDEX IF EXISTS "PurchaseRequestItem_description_trgm_idx";

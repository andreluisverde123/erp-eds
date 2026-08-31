-- Índice trigram para o autocomplete de material na solicitação.
--
-- A sugestão busca por ILIKE sobre todas as descrições já digitadas pela
-- empresa. Sem o índice, cada tecla varre a tabela inteira — e ela cresce com
-- um item por linha de toda solicitação já feita, que é justamente o que
-- torna a sugestão útil.
--
-- `pg_trgm` já está instalada (outros índices do schema a usam).
CREATE INDEX "PurchaseRequestItem_description_trgm_idx"
  ON "PurchaseRequestItem" USING GIN ("description" gin_trgm_ops);

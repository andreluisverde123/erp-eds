-- Interruptor do Diário de Obras por pessoa.
--
-- Nasce FALSE: liberar o Diário passa a ser um ato explícito, e não um efeito
-- colateral de pertencer ao perfil Engenharia.
ALTER TABLE "User" ADD COLUMN "diarioEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: quem JÁ tem vínculo com alguma obra estava usando o Diário de
-- verdade. Deixá-los em `false` transformaria esta migration numa remoção de
-- acesso silenciosa — o oposto do que a coluna existe para fazer.
--
-- Quem tem a permissão mas nenhum vínculo fica em `false` de propósito: essa
-- pessoa já entrava numa tela vazia, então nada observável muda para ela.
UPDATE "User" u
SET "diarioEnabled" = true
WHERE EXISTS (
  SELECT 1 FROM "UserConstructionSite" v WHERE v."userId" = u.id
);

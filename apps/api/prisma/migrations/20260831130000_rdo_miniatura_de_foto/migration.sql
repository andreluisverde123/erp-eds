-- Miniatura das fotos do RDO.
--
-- Aditiva: uma coluna anulável e um índice único. Nenhuma linha existente é
-- tocada, e nenhum backfill é necessário — foto sem miniatura continua válida,
-- e a rota da miniatura serve o original nesse caso.
--
-- A miniatura é um OBJETO SEPARADO no storage. O original nunca é alterado nem
-- substituído: a grade usa a miniatura, e abrir a foto continua entregando o
-- arquivo que o celular enviou.
--
-- Ela é gerada no NAVEGADOR, no mesmo passo em que a foto já é redimensionada
-- antes do upload (ver `apps/web/src/diario/lib/image-compression.ts`). O
-- monorepo não tem nenhuma biblioteca de processamento de imagem, e as
-- candidatas (`sharp`, binário nativo por plataforma; `jimp`, JavaScript puro
-- e lento) custariam ou uma dependência nativa na imagem Docker, ou CPU da API
-- num upload que já mantém o arquivo inteiro em memória. O aparelho, ao
-- contrário, já tem a imagem decodificada na mão.
ALTER TABLE "DailyReportMedia" ADD COLUMN "thumbnailKey" TEXT;

-- Único pela mesma razão de `storageKey`: o mesmo objeto não pode ser
-- registrado duas vezes, nem por retentativa de uma requisição que já gravou.
CREATE UNIQUE INDEX "DailyReportMedia_thumbnailKey_key" ON "DailyReportMedia"("thumbnailKey");

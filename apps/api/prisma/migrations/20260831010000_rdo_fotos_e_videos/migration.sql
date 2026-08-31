-- Fotos e vídeos do RDO.
--
-- Aditiva: um enum e uma tabela. Nada existente é alterado.
--
-- O BINÁRIO NÃO ENTRA NO POSTGRES. Esta tabela guarda só a referência ao
-- objeto (`storageKey`) e os metadados; o arquivo vive no `StorageService`,
-- que já existia no ERP e já abstrai disco local e bucket S3 (ver
-- `src/storage/`). Nenhuma segunda infraestrutura de armazenamento foi criada
-- para o Diário.

CREATE TYPE "DailyReportMediaType" AS ENUM ('PHOTO', 'VIDEO');

CREATE TABLE "DailyReportMedia" (
    "id" UUID NOT NULL,
    "dailyReportId" UUID NOT NULL,
    "type" "DailyReportMediaType" NOT NULL,
    -- Caminho do objeto no storage, gerado pelo SERVIDOR:
    -- `diario/<empresa>/<obra>/<relatório>/<uuid>.<ext>`.
    --
    -- `storageKey` e não `fileUrl` (como em `Attachment`): aquele campo nasceu
    -- guardando o caminho público `/uploads/...` porque o `FilesController`
    -- localiza o anexo POR ele. Aqui a mídia é servida por uma rota própria do
    -- Diário, que a encontra pelo id e confere o vínculo com a obra — a chave
    -- crua é o que o storage precisa, e uma URL no banco seria só mais um
    -- caminho a manter em sincronia.
    "storageKey" TEXT NOT NULL,
    -- Nome original APENAS como metadado. Nunca vira chave de storage nem
    -- parte de caminho: nome vindo do cliente já foi vetor de path traversal
    -- em aplicação demais.
    "fileName" TEXT NOT NULL,
    -- Tipo detectado pela ASSINATURA do arquivo (magic bytes), não o declarado
    -- pelo cliente no multipart.
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    -- Dimensões lidas do cabeçalho do próprio arquivo, no servidor. Nulas para
    -- vídeo, cujo contêiner exigiria um parser inteiro.
    "width" INTEGER,
    "height" INTEGER,
    -- Duração informada pelo navegador: metadado de exibição, não controle de
    -- segurança. Mentir aqui só faz a tela mostrar um número errado.
    "durationSeconds" INTEGER,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReportMedia_pkey" PRIMARY KEY ("id")
);

-- Único: o mesmo objeto não pode ser registrado duas vezes, nem por
-- retentativa de uma requisição que já tinha gravado o arquivo.
CREATE UNIQUE INDEX "DailyReportMedia_storageKey_key" ON "DailyReportMedia"("storageKey");
CREATE INDEX "DailyReportMedia_dailyReportId_idx" ON "DailyReportMedia"("dailyReportId");
CREATE INDEX "DailyReportMedia_createdById_idx" ON "DailyReportMedia"("createdById");

-- CASCADE a partir do relatório, como as outras cinco listas do RDO.
--
-- ATENÇÃO para quem for implementar exclusão de RDO: apagar o relatório apaga
-- estas linhas, mas NÃO apaga os objetos no storage. A exclusão de mídia
-- precisa passar por `DailyReportMediaService.remove`, que remove o arquivo;
-- um `DELETE` direto no relatório deixaria os arquivos órfãos no bucket.
ALTER TABLE "DailyReportMedia"
    ADD CONSTRAINT "DailyReportMedia_dailyReportId_fkey"
    FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT no autor: quem enviou a evidência faz parte do registro, e apagar
-- o usuário não pode apagar a autoria de um documento de obra.
ALTER TABLE "DailyReportMedia"
    ADD CONSTRAINT "DailyReportMedia_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

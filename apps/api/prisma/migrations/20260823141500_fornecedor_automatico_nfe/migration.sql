-- CreateEnum
CREATE TYPE "SupplierOrigin" AS ENUM ('MANUAL', 'NFE');

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "stateRegistration" TEXT,
ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "addressComplement" TEXT,
ADD COLUMN     "neighborhood" TEXT,
ADD COLUMN     "zipCode" VARCHAR(8),
ADD COLUMN     "origin" "SupplierOrigin" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "originAccessKey" VARCHAR(44);

-- Normalização do CNPJ já cadastrado.
--
-- A partir daqui `Supplier.document` guarda SÓ DÍGITOS: é essa a forma em que
-- o emitente chega da NF-e, e a unique (companyId, document) é sobre o texto.
-- Uma linha gravada como "12.345.678/0001-90" nunca casaria com "12345678000190"
-- e viraria fornecedor duplicado no primeiro documento importado.
--
-- Três cuidados, nesta ordem:
--
-- 1. `deletedAt IS NULL` — o soft delete manga o documento
--    ("<doc>__deleted__<uuid>"). Remover os não-dígitos dali destruiria o
--    mangling e poderia recriar a colisão que ele existe para evitar.
--
-- 2. `NOT EXISTS (...)` — se DUAS linhas ativas da mesma empresa normalizam
--    para o mesmo CNPJ, elas já são duplicatas de fato. Normalizar as duas
--    violaria a unique e derrubaria a migration inteira. Em vez disso a
--    primeira (a mais antiga) é normalizada e a outra fica como está, visível
--    para quem for decidir qual sobrevive — fundir cadastro é decisão de
--    negócio, não de migration.
--
-- 3. Nada é apagado. O pior caso é uma linha permanecer com máscara.
UPDATE "Supplier" AS s
SET "document" = regexp_replace(s."document", '\D', '', 'g')
WHERE s."deletedAt" IS NULL
  AND s."document" <> regexp_replace(s."document", '\D', '', 'g')
  AND regexp_replace(s."document", '\D', '', 'g') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "Supplier" AS outro
    WHERE outro."companyId" = s."companyId"
      AND outro."id" <> s."id"
      AND outro."document" = regexp_replace(s."document", '\D', '', 'g')
  )
  AND s."id" = (
    SELECT primeiro."id"
    FROM "Supplier" AS primeiro
    WHERE primeiro."companyId" = s."companyId"
      AND primeiro."deletedAt" IS NULL
      AND regexp_replace(primeiro."document", '\D', '', 'g')
          = regexp_replace(s."document", '\D', '', 'g')
    ORDER BY primeiro."createdAt" ASC, primeiro."id" ASC
    LIMIT 1
  );

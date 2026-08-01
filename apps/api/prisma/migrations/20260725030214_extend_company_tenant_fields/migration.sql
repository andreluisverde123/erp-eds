-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- AlterTable: novos campos de tenant em Company. `slug` entra nullable
-- primeiro pra permitir backfill dos registros existentes antes de virar
-- NOT NULL + UNIQUE (Company já tem dados hoje).
ALTER TABLE "Company"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "plan" "TenantPlan" NOT NULL DEFAULT 'STARTER',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'BRL',
  ADD COLUMN "primaryColor" TEXT,
  ADD COLUMN "secondaryColor" TEXT;

-- Backfill: deriva um slug único a partir do nome fantasia/razão social +
-- sufixo do id, pra qualquer linha que já exista antes desta migration.
UPDATE "Company"
SET "slug" = lower(regexp_replace(COALESCE("tradeName", "legalName"), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substring("id"::text, 1, 8)
WHERE "slug" IS NULL;

-- AlterTable: agora que todo registro existente tem slug, vira obrigatório.
ALTER TABLE "Company" ALTER COLUMN "slug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

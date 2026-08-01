-- CreateEnum
CREATE TYPE "SettingsTheme" AS ENUM ('LIGHT', 'DARK', 'SYSTEM');

-- AlterTable
ALTER TABLE "Company"
  ADD COLUMN "stateRegistration" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "addressNumber" TEXT,
  ADD COLUMN "addressComplement" TEXT,
  ADD COLUMN "responsibleName" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "position" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "ipAddress" TEXT;

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "erpName" TEXT NOT NULL DEFAULT 'EDS',
    "theme" "SettingsTheme" NOT NULL DEFAULT 'SYSTEM',
    "language" TEXT NOT NULL DEFAULT 'pt-BR',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "firstDayOfWeek" INTEGER NOT NULL DEFAULT 0,
    "dueDateAlertDays" INTEGER NOT NULL DEFAULT 7,
    "maxUploadSizeMb" INTEGER NOT NULL DEFAULT 10,
    "allowAttachments" BOOLEAN NOT NULL DEFAULT true,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "auditEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "channelSystem" BOOLEAN NOT NULL DEFAULT true,
    "channelEmail" BOOLEAN NOT NULL DEFAULT false,
    "channelWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "channelPush" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemSettings_companyId_key" ON "SystemSettings"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_companyId_eventKey_key" ON "NotificationPreference"("companyId", "eventKey");

-- AddForeignKey
ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

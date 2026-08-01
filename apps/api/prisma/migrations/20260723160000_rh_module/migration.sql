-- AlterEnum
ALTER TYPE "EmployeeStatus" ADD VALUE 'VACATION';

-- CreateEnum
CREATE TYPE "TimeEntryStatus" AS ENUM ('OPEN', 'CLOSED', 'INCONSISTENT');

-- AlterTable
ALTER TABLE "TimeEntry"
  ADD COLUMN "status" "TimeEntryStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "EmployeeAllocation" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProductionEntry" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN "deletedAt" TIMESTAMP(3);

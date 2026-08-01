-- AlterTable
ALTER TABLE "Company" ALTER COLUMN "cnpj" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "acceptedTermsAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

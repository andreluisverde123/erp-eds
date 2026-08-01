-- Tabelas do Financeiro (Invoice, AccountPayable, Payment) estão vazias
-- neste ponto, então os casts abaixo não perdem dados.

-- InvoiceStatus: PENDING/APPROVED/REJECTED/CANCELLED -> RECEIVED/VALIDATED/CANCELLED
CREATE TYPE "InvoiceStatus_new" AS ENUM ('RECEIVED', 'VALIDATED', 'CANCELLED');
ALTER TABLE "Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Invoice" ALTER COLUMN "status" TYPE "InvoiceStatus_new" USING ("status"::text::"InvoiceStatus_new");
ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
DROP TYPE "InvoiceStatus_old";
ALTER TABLE "Invoice" ALTER COLUMN "status" SET DEFAULT 'RECEIVED';

-- PaymentStatus (usado só por AccountPayable) renomeado + revalorado:
-- PENDING/PARTIALLY_PAID/PAID/OVERDUE/CANCELLED -> OPEN/PARTIAL/PAID/CANCELLED
CREATE TYPE "AccountPayableStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');
ALTER TABLE "AccountPayable" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "AccountPayable" ALTER COLUMN "status" TYPE "AccountPayableStatus" USING ("status"::text::"AccountPayableStatus");
DROP TYPE "PaymentStatus";
ALTER TABLE "AccountPayable" ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- Novo enum pro status do próprio registro de pagamento
CREATE TYPE "PaymentRecordStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'REFUNDED');

-- Invoice: toda nota agora nasce obrigatoriamente vinculada a uma ordem de compra
ALTER TABLE "Invoice" ALTER COLUMN "purchaseOrderId" SET NOT NULL;

-- Payment: ciclo de vida próprio + soft delete, alinhado com o resto do módulo
ALTER TABLE "Payment" ADD COLUMN "status" "PaymentRecordStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Payment" ADD COLUMN "deletedAt" TIMESTAMP(3);

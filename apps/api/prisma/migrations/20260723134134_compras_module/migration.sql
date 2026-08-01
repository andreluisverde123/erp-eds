-- Tabelas de Compras (Supplier, PurchaseRequest, PurchaseOrder) estão vazias
-- neste ponto, então os casts abaixo não perdem dados.

-- PurchaseRequestStatus: DRAFT/PENDING_APPROVAL/APPROVED/REJECTED/CANCELLED/CONVERTED_TO_ORDER
--                     -> DRAFT/PENDING/QUOTING/APPROVED/CANCELLED
CREATE TYPE "PurchaseRequestStatus_new" AS ENUM ('DRAFT', 'PENDING', 'QUOTING', 'APPROVED', 'CANCELLED');
ALTER TABLE "PurchaseRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PurchaseRequest" ALTER COLUMN "status" TYPE "PurchaseRequestStatus_new" USING ("status"::text::"PurchaseRequestStatus_new");
ALTER TYPE "PurchaseRequestStatus" RENAME TO "PurchaseRequestStatus_old";
ALTER TYPE "PurchaseRequestStatus_new" RENAME TO "PurchaseRequestStatus";
DROP TYPE "PurchaseRequestStatus_old";
ALTER TABLE "PurchaseRequest" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- PurchaseOrderStatus: DRAFT/SENT/CONFIRMED/PARTIALLY_RECEIVED/RECEIVED/CANCELLED
--                   -> OPEN/ISSUED/RECEIVED/CANCELLED
CREATE TYPE "PurchaseOrderStatus_new" AS ENUM ('OPEN', 'ISSUED', 'RECEIVED', 'CANCELLED');
ALTER TABLE "PurchaseOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "status" TYPE "PurchaseOrderStatus_new" USING ("status"::text::"PurchaseOrderStatus_new");
ALTER TYPE "PurchaseOrderStatus" RENAME TO "PurchaseOrderStatus_old";
ALTER TYPE "PurchaseOrderStatus_new" RENAME TO "PurchaseOrderStatus";
DROP TYPE "PurchaseOrderStatus_old";
ALTER TABLE "PurchaseOrder" ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- Supplier: novos campos de contato/localização
ALTER TABLE "Supplier" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "city" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "state" VARCHAR(2);

-- PurchaseRequest: "justification" renomeado pra "notes" (mesmo conceito, nome
-- alinhado ao vocabulário do módulo: "Observações")
ALTER TABLE "PurchaseRequest" RENAME COLUMN "justification" TO "notes";

-- PurchaseRequestItem: observação por item (coluna "Observação" da grade)
ALTER TABLE "PurchaseRequestItem" ADD COLUMN "notes" TEXT;

-- PurchaseOrder: toda ordem agora nasce obrigatoriamente de uma requisição
ALTER TABLE "PurchaseOrder" ALTER COLUMN "purchaseRequestId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ConstructionSite_name_trgm_idx" ON "ConstructionSite" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ConstructionSite_code_trgm_idx" ON "ConstructionSite" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ConstructionSite_clientName_trgm_idx" ON "ConstructionSite" USING GIN ("clientName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ContractEmployee_name_trgm_idx" ON "ContractEmployee" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Contractor_legalName_trgm_idx" ON "Contractor" USING GIN ("legalName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Contractor_tradeName_trgm_idx" ON "Contractor" USING GIN ("tradeName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Contractor_document_trgm_idx" ON "Contractor" USING GIN ("document" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "ContractorContract_code_trgm_idx" ON "ContractorContract" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CostCenter_name_trgm_idx" ON "CostCenter" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CostCenter_code_trgm_idx" ON "CostCenter" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Employee_name_trgm_idx" ON "Employee" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Employee_cpf_trgm_idx" ON "Employee" USING GIN ("cpf" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Employee_position_trgm_idx" ON "Employee" USING GIN ("position" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Invoice_number_trgm_idx" ON "Invoice" USING GIN ("number" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "PurchaseOrder_code_trgm_idx" ON "PurchaseOrder" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "PurchaseRequest_code_trgm_idx" ON "PurchaseRequest" USING GIN ("code" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Supplier_legalName_trgm_idx" ON "Supplier" USING GIN ("legalName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Supplier_tradeName_trgm_idx" ON "Supplier" USING GIN ("tradeName" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Supplier_document_trgm_idx" ON "Supplier" USING GIN ("document" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_name_trgm_idx" ON "User" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "User_email_trgm_idx" ON "User" USING GIN ("email" gin_trgm_ops);

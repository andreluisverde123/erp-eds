-- Forma de pagamento do contrato de terceiros, impressa na cláusula de
-- pagamento do PDF do contrato. Nula nos contratos já cadastrados: o PDF
-- deixa a linha em branco para preenchimento à mão.
ALTER TABLE "ContractorContract" ADD COLUMN "paymentTerms" TEXT;

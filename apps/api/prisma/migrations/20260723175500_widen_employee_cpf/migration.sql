-- AlterTable
-- Remove o limite fixo de VARCHAR(11): a validação de formato do CPF já
-- acontece na camada de DTO, e o soft delete precisa de espaço extra pra
-- "manglar" o valor (ver mangleDeletedCode) e liberar o CPF pra reuso.
ALTER TABLE "Employee" ALTER COLUMN "cpf" TYPE TEXT;

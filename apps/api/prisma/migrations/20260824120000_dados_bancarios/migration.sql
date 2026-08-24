-- Dados bancários de quem recebe dinheiro da empresa.
--
-- Tabela nova, nenhuma linha existente é tocada. O único efeito sobre o que
-- já está no ar é um valor a mais no enum de auditoria.

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('CHECKING', 'SAVINGS', 'PAYMENT');

-- CreateEnum
CREATE TYPE "PixKeyType" AS ENUM ('CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM');

-- AlterEnum
--
-- Revelar dados bancários completos é uma LEITURA que precisa deixar rastro, e
-- as três ações existentes só descrevem escrita. `ADD VALUE` não reescreve a
-- tabela nem invalida linha nenhuma: toda auditoria já gravada continua
-- exatamente como está.
ALTER TYPE "AuditAction" ADD VALUE 'READ';

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID,
    "employeeId" UUID,
    "contractorId" UUID,
    "bankCode" VARCHAR(3) NOT NULL,
    "bankName" TEXT NOT NULL,
    "branch" VARCHAR(6) NOT NULL,
    "branchDigit" VARCHAR(1),
    "accountType" "BankAccountType" NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountNumberMasked" TEXT NOT NULL,
    "accountDigit" VARCHAR(1),
    "pixKeyType" "PixKeyType",
    "pixKey" TEXT,
    "pixKeyMasked" TEXT,
    "holderName" TEXT,
    "holderDocument" VARCHAR(14),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- Arco exclusivo: exatamente UM dono por conta.
--
-- No banco, e não só no service. É esta linha que impede uma conta órfã (que
-- nunca apareceria em tela nenhuma) ou de dois donos (que dois setores
-- editariam sem saber um do outro) de existir por causa de um bug de código.
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_owner_arc_check"
    CHECK (num_nonnulls("userId", "employeeId", "contractorId") = 1);

-- O par (chave, forma mascarada) é indivisível: gravar um sem o outro deixaria
-- a tela sem o que mostrar ou o registro sem o que decifrar.
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_pix_pair_check"
    CHECK (num_nonnulls("pixKeyType", "pixKey", "pixKeyMasked") IN (0, 3));

-- Titular de terceiro exige nome E documento — é o documento que o banco
-- confere na hora de creditar.
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_holder_pair_check"
    CHECK (num_nonnulls("holderName", "holderDocument") IN (0, 2));

-- CreateIndex
CREATE INDEX "BankAccount_companyId_idx" ON "BankAccount"("companyId");

-- CreateIndex
CREATE INDEX "BankAccount_userId_idx" ON "BankAccount"("userId");

-- CreateIndex
CREATE INDEX "BankAccount_employeeId_idx" ON "BankAccount"("employeeId");

-- CreateIndex
CREATE INDEX "BankAccount_contractorId_idx" ON "BankAccount"("contractorId");

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
--
-- CASCADE nos três donos: a conta não tem vida própria: só existe para dizer
-- onde uma pessoa recebe. Sumindo a pessoa do banco, a conta vira lixo com
-- dado sensível dentro. Vale lembrar que usuário, funcionário e terceirizado
-- são soft-deletados pelo sistema — o CASCADE só dispara numa remoção física,
-- feita fora da aplicação.
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
--
-- O catálogo (`Permission`) é global e o seed já o mantém em dia por upsert.
-- Ele NÃO liga permissão nova a papel existente: `seedBootstrap` só cria
-- papéis num banco vazio. Sem o INSERT abaixo, a EDS — que já está instalada —
-- subiria com a tela nova e nenhum papel capaz de abri-la.
--
-- Quem recebe espelha `DEFAULT_ROLES` exatamente, para uma instalação migrada
-- ficar indistinguível de uma instalação nova: SÓ o papel ADMIN, com as três.
-- Nenhum outro papel padrão recebe — quem mais pode ver para onde o dinheiro de
-- um colaborador vai é decisão do cliente, e atribuir depois é um clique em
-- Configurações > Perfis.
--
-- O casamento é por `Role.type`, não por nome: os papéis padrão são `isSystem`
-- e o tipo é o que não muda.

INSERT INTO "Permission" ("id", "code", "module", "action", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'dados_bancarios.view', 'dados_bancarios', 'view', 'Ver os dados bancários mascarados de usuários e colaboradores.', NOW(), NOW()),
  (gen_random_uuid(), 'dados_bancarios.manage', 'dados_bancarios', 'manage', 'Cadastrar, editar e desativar dados bancários.', NOW(), NOW()),
  (gen_random_uuid(), 'dados_bancarios.reveal', 'dados_bancarios', 'reveal', 'Ver o número de conta e a chave PIX completos. Cada consulta fica registrada na auditoria.', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), r."id", p."id", NOW(), NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" IN ('dados_bancarios.view', 'dados_bancarios.manage', 'dados_bancarios.reveal')
WHERE r."type" = 'ADMIN'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

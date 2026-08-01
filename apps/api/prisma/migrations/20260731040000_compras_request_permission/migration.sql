-- Separa "pedir" de "comprar". Antes, abrir uma solicitação exigia
-- `compras.manage` — a mesma permissão que cota, aprova, emite ordem de compra
-- e cadastra fornecedor. Ou seja: para o engenheiro conseguir pedir material,
-- ele teria que poder aprovar o próprio pedido, e a alçada por valor
-- (`purchaseApprovalThreshold`) perderia o sentido.
--
-- Quem recebe: todo papel que já tem `compras.manage` (continua podendo abrir
-- solicitação, nada muda para Compras/Diretoria/Administrador) MAIS todo papel
-- que tem `engenharia.manage` — é o engenheiro quem pede para o setor de
-- Compras.

INSERT INTO "Permission" ("id", "code", "module", "action", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'compras.request', 'compras', 'request', 'Abrir solicitações de compra, editá-las em rascunho e enviá-las para Compras.', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT DISTINCT gen_random_uuid(), rp."roleId", nova."id", NOW(), NOW()
FROM "RolePermission" rp
JOIN "Permission" origem ON origem."id" = rp."permissionId"
  AND origem."code" IN ('compras.manage', 'engenharia.manage')
JOIN "Permission" nova ON nova."code" = 'compras.request'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- A descrição de `compras.manage` deixa de prometer "criar": criar agora é
-- `compras.request`.
UPDATE "Permission"
SET "description" = 'Cotar, aprovar, excluir solicitações e gerir ordens de compra e fornecedores.',
    "updatedAt" = NOW()
WHERE "code" = 'compras.manage';

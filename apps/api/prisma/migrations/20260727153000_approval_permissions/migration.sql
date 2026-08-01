-- Permissões de alçada. Nada muda no comportamento até alguém definir um
-- limite em Configurações > Sistema (`purchaseApprovalThreshold` e
-- `paymentApprovalThreshold` nascem em 0 = sem alçada).
--
-- Quem recebe: apenas os papéis que já administram o sistema
-- (`admin.manage_users`). O ponto da alçada é justamente separar "quem lança"
-- de "quem aprova" — dar aprovação a todo mundo que tem `.manage` deixaria o
-- limite decorativo. Delegar para outros papéis é decisão do administrador,
-- em Configurações > Perfis.

INSERT INTO "Permission" ("id", "code", "module", "action", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'compras.approve',    'compras',    'approve', 'Aprovar solicitações de compra acima da alçada definida em Configurações.', NOW(), NOW()),
  (gen_random_uuid(), 'financeiro.approve', 'financeiro', 'approve', 'Registrar pagamentos acima da alçada definida em Configurações.', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), rp."roleId", nova."id", NOW(), NOW()
FROM "RolePermission" rp
JOIN "Permission" admin ON admin."id" = rp."permissionId" AND admin."code" = 'admin.manage_users'
JOIN "Permission" nova ON nova."code" IN ('compras.approve', 'financeiro.approve')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

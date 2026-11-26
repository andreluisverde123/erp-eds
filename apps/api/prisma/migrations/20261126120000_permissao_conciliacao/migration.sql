-- CONCILIAÇÃO DE NOTAS COM PERMISSÃO PRÓPRIA.
--
-- Até aqui a conciliação usava `financeiro.view` / `financeiro.manage`, e quem
-- conciliava nota via junto contas a pagar e pagamentos. A EDS quis um perfil
-- de aprendiz que só concilia — daí o par `conciliacao.*`.
--
-- Só dado, nenhuma tabela muda. O backfill copia o acesso de hoje: quem tem
-- `financeiro.view` ganha `conciliacao.view`, quem tem `financeiro.manage`
-- ganha `conciliacao.manage`. Ninguém perde nem ganha tela.

INSERT INTO "Permission" ("id", "code", "module", "action", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'conciliacao.view',   'conciliacao', 'view',   'Consultar as notas recebidas e compará-las com as ordens de compra.', NOW(), NOW()),
  (gen_random_uuid(), 'conciliacao.manage', 'conciliacao', 'manage', 'Lançar notas recebidas, conciliá-las com a ordem de compra e cancelá-las.', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), rp."roleId", novo."id", NOW(), NOW()
FROM "RolePermission" rp
JOIN "Permission" antigo ON antigo."id" = rp."permissionId"
JOIN "Permission" novo ON novo."code" = CASE antigo."code"
  WHEN 'financeiro.view'   THEN 'conciliacao.view'
  WHEN 'financeiro.manage' THEN 'conciliacao.manage'
END
WHERE antigo."code" IN ('financeiro.view', 'financeiro.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

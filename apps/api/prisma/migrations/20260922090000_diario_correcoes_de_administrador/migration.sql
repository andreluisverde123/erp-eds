-- Diário: permissão de correção (excluir RDO finalizado e corrigir a
-- numeração). Administrador e Engenharia recebem; a Fiscalização não.
INSERT INTO "Permission" ("id", "code", "module", "action", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'diario.report.admin', 'diario', 'report_admin', 'Excluir relatórios diários já finalizados e corrigir a numeração dos RDOs. Fica registrado na auditoria.', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), r."id", p."id", NOW(), NOW()
FROM "Role" r
JOIN "Permission" p ON p."code" = 'diario.report.admin'
WHERE r."type" IN ('ADMIN', 'ENGINEER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

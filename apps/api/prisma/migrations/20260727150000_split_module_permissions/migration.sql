-- Separa `<módulo>.access` em `<módulo>.view` (consultar) e `<módulo>.manage`
-- (criar/editar/excluir), e cria o módulo Terceiros, que até aqui usava as
-- permissões de Engenharia.
--
-- A migração PRESERVA o acesso efetivo de cada papel existente:
--   * quem tinha `dashboard.view` (a chave de leitura de tudo até agora)
--     recebe o `.view` dos cinco módulos de negócio;
--   * quem tinha `<módulo>.access` recebe `<módulo>.manage`;
--   * quem tinha `engenharia.access` recebe também `terceiros.manage`.
-- Ninguém ganha nem perde poder aqui — o ganho é passar a existir a
-- possibilidade de tirar leitura de um módulo específico em Configurações.

-- 1. Catálogo novo -----------------------------------------------------------
INSERT INTO "Permission" ("id", "code", "module", "action", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'engenharia.view',   'engenharia', 'view',   'Consultar obras e centros de custo.', NOW(), NOW()),
  (gen_random_uuid(), 'engenharia.manage', 'engenharia', 'manage', 'Criar, editar e excluir obras e centros de custo.', NOW(), NOW()),
  (gen_random_uuid(), 'compras.view',      'compras',    'view',   'Consultar solicitações, ordens de compra e fornecedores.', NOW(), NOW()),
  (gen_random_uuid(), 'compras.manage',    'compras',    'manage', 'Criar, editar, aprovar e excluir solicitações, ordens e fornecedores.', NOW(), NOW()),
  (gen_random_uuid(), 'financeiro.view',   'financeiro', 'view',   'Consultar notas fiscais, contas a pagar e pagamentos.', NOW(), NOW()),
  (gen_random_uuid(), 'financeiro.manage', 'financeiro', 'manage', 'Lançar e alterar notas fiscais, contas a pagar e pagamentos.', NOW(), NOW()),
  (gen_random_uuid(), 'rh.view',           'rh',         'view',   'Consultar funcionários, ponto, produção e holerites.', NOW(), NOW()),
  (gen_random_uuid(), 'rh.manage',         'rh',         'manage', 'Cadastrar e alterar funcionários, ponto, produção e holerites.', NOW(), NOW()),
  (gen_random_uuid(), 'terceiros.view',    'terceiros',  'view',   'Consultar terceiros, contratos e documentação.', NOW(), NOW()),
  (gen_random_uuid(), 'terceiros.manage',  'terceiros',  'manage', 'Cadastrar e alterar terceiros, contratos e documentação.', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

UPDATE "Permission"
SET "description" = 'Ver a home, a busca global e as telas de Processos.', "updatedAt" = NOW()
WHERE "code" = 'dashboard.view';

-- 2. Leitura: quem via tudo por `dashboard.view` continua vendo -------------
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), rp."roleId", novo."id", NOW(), NOW()
FROM "RolePermission" rp
JOIN "Permission" antiga ON antiga."id" = rp."permissionId" AND antiga."code" = 'dashboard.view'
JOIN "Permission" novo ON novo."code" IN (
  'engenharia.view', 'compras.view', 'financeiro.view', 'rh.view', 'terceiros.view'
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 3. Escrita: `<módulo>.access` vira `<módulo>.manage` ----------------------
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), rp."roleId", novo."id", NOW(), NOW()
FROM "RolePermission" rp
JOIN "Permission" antiga ON antiga."id" = rp."permissionId"
JOIN "Permission" novo ON novo."code" = REPLACE(antiga."code", '.access', '.manage')
WHERE antiga."code" LIKE '%.access'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 3b. Terceiros era governado por `engenharia.access` -----------------------
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), rp."roleId", novo."id", NOW(), NOW()
FROM "RolePermission" rp
JOIN "Permission" antiga ON antiga."id" = rp."permissionId" AND antiga."code" = 'engenharia.access'
JOIN "Permission" novo ON novo."code" = 'terceiros.manage'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 4. Remove o catálogo antigo (o vínculo cai por ON DELETE CASCADE) ---------
DELETE FROM "Permission" WHERE "code" LIKE '%.access';

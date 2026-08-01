/**
 * Teste de isolamento multi-tenant.
 *
 * Cria uma segunda empresa (com um usuário admin próprio), pega um registro
 * real da empresa do seed e tenta acessá-lo com o token da outra empresa.
 * Ao final remove tudo que criou.
 *
 * Uso (com a API rodando em :3000):
 *   npx ts-node --transpile-only scripts/tenant-isolation-check.ts
 */
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

const API = process.env.API_URL ?? 'http://localhost:3000';
const TENANT_B_EMAIL = 'admin@tenant-b-teste.app';
const TENANT_B_PASSWORD = 'Eds@12345';
const TENANT_B_SLUG = 'tenant-b-teste';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`login falhou para ${email}: ${response.status}`);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

async function call(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  const text = await response.text();
  return { status: response.status, body: text.slice(0, 160) };
}

function report(label: string, expected: string, actual: string) {
  const ok = actual.startsWith(expected);
  console.log(
    `${ok ? '✅' : '❌ VAZAMENTO'} ${label}\n      esperado: ${expected} | obtido: ${actual}`,
  );
  return ok;
}

async function main() {
  // --- setup: empresa B com um admin próprio -------------------------------
  await cleanupTenantB();

  const permissions = await prisma.permission.findMany({ select: { id: true } });
  const companyB = await prisma.company.create({
    data: { slug: TENANT_B_SLUG, cnpj: '99999999000199', legalName: 'Tenant B Teste LTDA' },
  });
  const roleB = await prisma.role.create({
    data: {
      companyId: companyB.id,
      name: 'Administrador',
      type: 'ADMIN',
      description: 'Papel de teste',
      rolePermissions: {
        create: permissions.map((permission) => ({ permissionId: permission.id })),
      },
    },
  });
  const userB = await prisma.user.create({
    data: {
      companyId: companyB.id,
      name: 'Admin Tenant B',
      email: TENANT_B_EMAIL,
      passwordHash: await bcrypt.hash(TENANT_B_PASSWORD, 10),
      userRoles: { create: { roleId: roleB.id } },
    },
  });

  // --- registros reais da empresa A (a do seed) ----------------------------
  // A empresa de comparação precisa TER dados, senão as verificações de
  // acesso direto a registro são todas puladas e o teste passa sem provar
  // nada. Prioriza quem tem obra cadastrada; só cai para "qualquer outra"
  // se nenhuma tiver.
  const companyA =
    (await prisma.company.findFirst({
      where: { id: { not: companyB.id }, constructionSites: { some: { deletedAt: null } } },
    })) ?? (await prisma.company.findFirst({ where: { id: { not: companyB.id } } }));
  if (!companyA) throw new Error('nenhuma outra empresa no banco para comparar');

  // `deletedAt: null` importa: o banco de dev tem obras já excluídas de testes
  // anteriores, e uma delas mascararia a verificação de "continua intacta".
  const siteA = await prisma.constructionSite.findFirst({
    where: { companyId: companyA.id, deletedAt: null },
  });
  const employeeA = await prisma.employee.findFirst({ where: { companyId: companyA.id } });
  const requestA = await prisma.purchaseRequest.findFirst({ where: { companyId: companyA.id } });
  const payslipA = await prisma.payslip.findFirst({
    where: { employee: { companyId: companyA.id } },
  });
  const userAOther = await prisma.user.findFirst({ where: { companyId: companyA.id } });

  console.log(`Empresa A: ${companyA.legalName} (${companyA.id})`);
  console.log(`Empresa B: ${companyB.legalName} (${companyB.id})\n`);

  const tokenB = await login(TENANT_B_EMAIL, TENANT_B_PASSWORD);
  const results: boolean[] = [];

  // --- listagens: o tenant B não pode ver NADA do A ------------------------
  for (const [label, path] of [
    ['GET /construction-sites', '/construction-sites'],
    ['GET /employees', '/employees'],
    ['GET /purchase-requests', '/purchase-requests'],
    ['GET /suppliers', '/suppliers'],
    ['GET /invoices', '/invoices'],
    ['GET /contractors', '/contractors'],
    ['GET /audit-logs', '/audit-logs'],
  ] as const) {
    const response = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const payload = (await response.json()) as { meta?: { total?: number }; data?: unknown[] };
    const total = payload.meta?.total ?? payload.data?.length ?? -1;
    results.push(report(`${label} (listagem do tenant B)`, 'total=0', `total=${total}`));
  }

  // /users é o único endpoint em que o tenant B legitimamente vê algo: o
  // próprio admin dele. O que não pode é aparecer usuário da empresa A.
  const usersResponse = await fetch(`${API}/users`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  });
  const usersPayload = (await usersResponse.json()) as { data?: { id: string; email: string }[] };
  const usersFromA = await prisma.user.count({
    where: { companyId: companyA.id, id: { in: (usersPayload.data ?? []).map((user) => user.id) } },
  });
  results.push(
    report(
      'GET /users (só enxerga o próprio usuário)',
      'próprios=1 daEmpresaA=0',
      `próprios=${usersPayload.data?.length ?? '?'} daEmpresaA=${usersFromA}`,
    ),
  );

  // --- acesso direto a registros da empresa A ------------------------------
  const directTargets: [string, string][] = [];
  if (siteA) directTargets.push(['GET obra da empresa A', `/construction-sites/${siteA.id}`]);
  if (employeeA) directTargets.push(['GET funcionário da empresa A', `/employees/${employeeA.id}`]);
  if (requestA)
    directTargets.push(['GET solicitação da empresa A', `/purchase-requests/${requestA.id}`]);
  if (payslipA) directTargets.push(['GET holerite da empresa A', `/payslips/${payslipA.id}`]);
  if (userAOther) directTargets.push(['GET usuário da empresa A', `/users/${userAOther.id}`]);

  for (const [label, path] of directTargets) {
    const response = await call(tokenB, path);
    results.push(report(label, '404', String(response.status)));
  }

  // --- escrita cruzada -----------------------------------------------------
  if (siteA) {
    const patch = await call(tokenB, `/construction-sites/${siteA.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'INVADIDO PELO TENANT B' }),
    });
    results.push(report('PATCH obra da empresa A', '404', String(patch.status)));

    const del = await call(tokenB, `/construction-sites/${siteA.id}`, { method: 'DELETE' });
    results.push(report('DELETE obra da empresa A', '404', String(del.status)));
  }
  if (employeeA) {
    const patch = await call(tokenB, `/employees/${employeeA.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'INVADIDO PELO TENANT B' }),
    });
    results.push(report('PATCH funcionário da empresa A', '404', String(patch.status)));
  }

  // --- o registro da empresa A continua intacto? ---------------------------
  if (siteA) {
    const after = await prisma.constructionSite.findUnique({ where: { id: siteA.id } });
    const intact =
      after?.name === siteA.name && after?.deletedAt?.getTime() === siteA.deletedAt?.getTime();
    console.log(
      `${intact ? '✅' : '❌ VAZAMENTO'} obra da empresa A intacta após as tentativas\n      nome=${after?.name} deletedAt=${after?.deletedAt ?? 'null'}`,
    );
    results.push(intact);
  }

  // --- limpeza -------------------------------------------------------------
  void userB;
  void roleB;
  await cleanupTenantB();
  console.log('\nEmpresa de teste removida.');

  const failures = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failures}/${results.length} verificações passaram.`);
  process.exitCode = failures ? 1 : 0;
}

/// Remove qualquer resíduo da empresa de teste (inclusive de uma execução
/// anterior que tenha falhado no meio) — nada do tenant de teste fica no banco.
async function cleanupTenantB(): Promise<void> {
  const existing = await prisma.company.findUnique({
    where: { slug: TENANT_B_SLUG },
    select: { id: true },
  });
  if (!existing) return;

  const roles = await prisma.role.findMany({
    where: { companyId: existing.id },
    select: { id: true },
  });
  const users = await prisma.user.findMany({
    where: { companyId: existing.id },
    select: { id: true },
  });
  const roleIds = roles.map((role) => role.id);
  const userIds = users.map((user) => user.id);

  await prisma.userRole.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { roleId: { in: roleIds } }] },
  });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
  await prisma.auditLog.deleteMany({ where: { companyId: existing.id } });
  await prisma.user.deleteMany({ where: { companyId: existing.id } });
  await prisma.role.deleteMany({ where: { companyId: existing.id } });
  await prisma.company.delete({ where: { id: existing.id } });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

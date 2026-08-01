/**
 * Verifica que os `where: { id, <escopo do tenant> }` aplicados nos
 * update/delete funcionam em runtime — type-check não prova nada aqui, porque
 * o filtro por relação (`employee: { companyId }`) só é aceito de fato pelo
 * mecanismo de "extended where unique" do Prisma.
 *
 * Para cada modelo: um update no-op com o companyId CERTO tem que passar, e o
 * mesmo update com um companyId ERRADO tem que falhar (P2025) — é isso que
 * torna a checagem uma defesa real, e não um enfeite.
 *
 *   npx ts-node --transpile-only scripts/scoped-where-check.ts
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const OTHER_COMPANY_ID = randomUUID();
const results: boolean[] = [];

async function check(
  label: string,
  runWithScope: (companyId: string) => Promise<unknown>,
  realCompanyId: string,
): Promise<void> {
  let okWithRightScope: boolean;
  try {
    await runWithScope(realCompanyId);
    okWithRightScope = true;
  } catch (error) {
    okWithRightScope = false;
    console.log(`   erro inesperado: ${(error as Error).message.split('\n')[0]}`);
  }

  let blockedWithWrongScope = false;
  try {
    await runWithScope(OTHER_COMPANY_ID);
  } catch {
    blockedWithWrongScope = true;
  }

  const ok = okWithRightScope && blockedWithWrongScope;
  results.push(ok);
  console.log(
    `${ok ? '✅' : '❌'} ${label}  (empresa certa: ${okWithRightScope ? 'passou' : 'FALHOU'}, empresa errada: ${blockedWithWrongScope ? 'bloqueado' : 'PASSOU — VAZAMENTO'})`,
  );
}

async function main() {
  const company = await prisma.company.findFirstOrThrow({ select: { id: true, legalName: true } });
  console.log(`Empresa: ${company.legalName}\n`);

  const site = await prisma.constructionSite.findFirst({
    where: { companyId: company.id, deletedAt: null },
  });
  if (site) {
    await check(
      'ConstructionSite  (companyId direto)',
      (companyId) =>
        prisma.constructionSite.update({
          where: { id: site.id, companyId },
          data: { name: site.name },
        }),
      company.id,
    );
  }

  const payslip = await prisma.payslip.findFirst({
    where: { employee: { companyId: company.id }, deletedAt: null },
  });
  if (payslip) {
    await check(
      'Payslip           (via employee)',
      (companyId) =>
        prisma.payslip.update({
          where: { id: payslip.id, employee: { companyId } },
          data: { notes: payslip.notes },
        }),
      company.id,
    );
  }

  const payment = await prisma.payment.findFirst({
    where: { accountPayable: { companyId: company.id }, deletedAt: null },
  });
  if (payment) {
    await check(
      'Payment           (via accountPayable)',
      (companyId) =>
        prisma.payment.update({
          where: { id: payment.id, accountPayable: { companyId } },
          data: { notes: payment.notes },
        }),
      company.id,
    );
  }

  const document = await prisma.contractDocument.findFirst({
    where: { contract: { companyId: company.id }, deletedAt: null },
  });
  if (document) {
    await check(
      'ContractDocument  (via contract)',
      (companyId) =>
        prisma.contractDocument.update({
          where: { id: document.id, contract: { companyId } },
          data: { name: document.name },
        }),
      company.id,
    );
  }

  const timeEntry = await prisma.timeEntry.findFirst({
    where: { employee: { companyId: company.id }, deletedAt: null },
  });
  if (timeEntry) {
    await check(
      'TimeEntry         (via employee)',
      (companyId) =>
        prisma.timeEntry.update({
          where: { id: timeEntry.id, employee: { companyId } },
          data: { notes: timeEntry.notes },
        }),
      company.id,
    );
  }

  const failures = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failures}/${results.length} verificações passaram.`);
  process.exitCode = failures ? 1 : 0;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

/**
 * Prova que os índices trigram entram em ação nas buscas por texto.
 *
 * Com 3 registros o Postgres varre a tabela de qualquer jeito (é mais barato
 * que ler o índice), então medir no banco de desenvolvimento não diria nada.
 * O script cria massa temporária numa empresa descartável, compara o plano de
 * execução com e sem o índice, e remove tudo no final.
 *
 *   npx ts-node --transpile-only scripts/search-index-benchmark.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ROWS = 20_000;
const SLUG = 'benchmark-indices-temporario';

async function explain(label: string, sql: string): Promise<void> {
  const rows = (await prisma.$queryRawUnsafe(`EXPLAIN ANALYZE ${sql}`)) as {
    'QUERY PLAN': string;
  }[];
  const plan = rows.map((row) => row['QUERY PLAN']).join('\n');
  const scan =
    plan.includes('Bitmap Index Scan') || plan.includes('Index Scan')
      ? 'ÍNDICE'
      : 'VARREDURA COMPLETA';
  const time = plan.match(/Execution Time: ([\d.]+) ms/)?.[1] ?? '?';
  console.log(`  ${label.padEnd(28)} ${scan.padEnd(20)} ${time} ms`);
}

async function main() {
  const company = await prisma.company.create({
    data: { slug: SLUG, legalName: 'Benchmark de Índices (temporário)' },
    select: { id: true },
  });

  try {
    console.log(`Criando ${ROWS.toLocaleString('pt-BR')} fornecedores de teste...`);
    const batch = Array.from({ length: ROWS }, (_, index) => ({
      companyId: company.id,
      legalName: `Fornecedor Teste ${index} Materiais de Construcao LTDA`,
      tradeName: `Fornecedor ${index}`,
      document: String(10_000_000_000_000 + index),
    }));
    for (let i = 0; i < batch.length; i += 2000) {
      await prisma.supplier.createMany({ data: batch.slice(i, i + 2000) });
    }
    await prisma.$executeRawUnsafe('ANALYZE "Supplier"');

    const search = `SELECT id FROM "Supplier" WHERE "companyId" = '${company.id}' AND "legalName" ILIKE '%Teste 17345%'`;

    console.log('\nBusca por trecho do nome (o que o campo de busca do sistema faz):');
    await explain('com índice trigram', search);

    await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "Supplier_legalName_trgm_idx"');
    await prisma.$executeRawUnsafe('ANALYZE "Supplier"');
    await explain('sem índice (como era antes)', search);

    await prisma.$executeRawUnsafe(
      'CREATE INDEX "Supplier_legalName_trgm_idx" ON "Supplier" USING GIN ("legalName" gin_trgm_ops)',
    );
    console.log('\nÍndice recriado.');
  } finally {
    await prisma.supplier.deleteMany({ where: { companyId: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
    console.log('Massa de teste removida.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

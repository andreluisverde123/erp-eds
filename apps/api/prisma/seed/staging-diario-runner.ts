import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../generated/prisma/client';
import { seedPermissionCatalog } from './catalog';
import { gerarSenha, prepararDiarioParaTeste } from './staging-diario';

/// Entrada do preparo do Diário num ambiente com dado real.
///
/// Roda DUAS coisas, ambas idempotentes e aditivas:
///   1. o catálogo de permissões (tabela global; é ele que traz `diario.*`);
///   2. papel, permissões, usuários de teste e vínculos.
///
/// A senha é gerada a cada execução e impressa uma única vez.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const catalogo = await seedPermissionCatalog(prisma);
  console.log(`Catálogo sincronizado (${catalogo.size} permissões).`);

  const senha = process.env.DIARIO_TEST_PASSWORD ?? gerarSenha();
  await prepararDiarioParaTeste(prisma, senha);

  console.log('');
  console.log('==========================================');
  console.log(`SENHA DOS USUÁRIOS DE TESTE: ${senha}`);
  console.log('==========================================');
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';
import { readBootstrapConfig, seedBootstrap } from './seed/bootstrap';
import { seedPermissionCatalog } from './seed/catalog';
import { seedDemo } from './seed/demo';

/// Orquestrador do seed, dividido em três responsabilidades bem diferentes:
///
/// - **catálogo** (`seed/catalog.ts`): as permissões do produto. Tabela global,
///   necessária em TODA instalação, inclusive produção. Idempotente.
/// - **bootstrap** (`seed/bootstrap.ts`): a EDS, os papéis padrão e o primeiro
///   administrador. Só roda quando `BOOTSTRAP_ADMIN_EMAIL`/`_PASSWORD` são
///   informadas, e só num banco sem nenhum usuário — é a porta de entrada de
///   uma instalação nova, e nada além disso.
/// - **demonstração** (`seed/demo.ts`): uma empresa-vitrine com dados de
///   exemplo e senha conhecida. Só roda com `SEED_DEMO=true`.
///
/// A separação entre catálogo e demonstração existe porque os dois eram o mesmo
/// arquivo: rodar o seed num ambiente publicado criava uma empresa fictícia e
/// gravava a mesma senha conhecida em seis usuários. Agora isso é impossível
/// por omissão — quem quiser dados de demonstração precisa pedir explicitamente.
///
/// O bootstrap nasceu do buraco que essa separação abriu: sem ele, o seed de
/// produção populava só permissões e o sistema subia sem ninguém para logar.
const SEED_DEMO = process.env.SEED_DEMO === 'true';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  // Lido ANTES de tocar o banco: uma senha fora do padrão derruba o seed aqui,
  // em vez de no meio da transação, depois do catálogo já sincronizado.
  const bootstrapConfig = readBootstrapConfig(process.env);

  const permissionByCode = await seedPermissionCatalog(prisma);
  console.log(`Catálogo de permissões sincronizado (${permissionByCode.size} permissões).`);

  if (bootstrapConfig) {
    await seedBootstrap(prisma, permissionByCode, bootstrapConfig);
  }

  if (!SEED_DEMO) {
    console.log('Dados de demonstração ignorados. Use SEED_DEMO=true para incluí-los.');
    return;
  }

  await seedDemo(prisma, permissionByCode);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

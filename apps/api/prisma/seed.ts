import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';
import { seedPermissionCatalog } from './seed/catalog';
import { seedDemo } from './seed/demo';

/// Orquestrador do seed, dividido em duas responsabilidades bem diferentes:
///
/// - **catálogo** (`seed/catalog.ts`): as permissões do produto. Tabela global,
///   necessária em TODA instalação, inclusive produção. Idempotente.
/// - **demonstração** (`seed/demo.ts`): uma empresa-vitrine com dados de
///   exemplo e senha conhecida. Só roda com `SEED_DEMO=true`.
///
/// A separação existe porque os dois eram o mesmo arquivo: rodar o seed num
/// ambiente publicado criava uma empresa fictícia e gravava a mesma senha
/// conhecida em seis usuários. Agora isso é impossível por omissão — quem
/// quiser dados de demonstração precisa pedir explicitamente.
const SEED_DEMO = process.env.SEED_DEMO === 'true';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const permissionByCode = await seedPermissionCatalog(prisma);
  console.log(`Catálogo de permissões sincronizado (${permissionByCode.size} permissões).`);

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

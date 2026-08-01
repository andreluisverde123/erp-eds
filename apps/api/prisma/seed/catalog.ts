import type { PrismaClient } from '../../generated/prisma/client';

/// Catálogo de permissões do produto. Vem de `src/common/tenancy` — a MESMA
/// fonte que o cadastro self-service usa, para uma empresa criada pela tela
/// nunca nascer diferente de uma criada localmente.
import { DEFAULT_PERMISSIONS } from '../../src/common/tenancy/default-roles';

/// A tabela `Permission` é GLOBAL (o código é único no banco inteiro), ao
/// contrário de `Role`, que é por empresa. Por isso o catálogo é o único
/// seed que TODA instalação precisa rodar — inclusive produção, e inclusive
/// numa base sem nenhuma empresa cadastrada.
///
/// Devolve o mapa código → permissão porque o seed de demonstração precisa
/// dele para montar os papéis.
export async function seedPermissionCatalog(
  prisma: PrismaClient,
): Promise<Map<string, { id: string }>> {
  const permissionByCode = new Map<string, { id: string }>();

  for (const permission of DEFAULT_PERMISSIONS) {
    const created = await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        module: permission.module,
        action: permission.action,
        description: permission.description,
      },
      create: permission,
    });
    permissionByCode.set(created.code, created);
  }

  return permissionByCode;
}

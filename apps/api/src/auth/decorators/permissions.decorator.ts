import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/// Exige que o usuário possua todas as permissões informadas (código do
/// Permission no Prisma, ex.: "financeiro.access"). Cada novo módulo do ERP
/// deve proteger seus controllers com esta decoration em vez de checar papéis
/// diretamente — permissões são a unidade real de autorização; papéis são só
/// um agrupamento delas.
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

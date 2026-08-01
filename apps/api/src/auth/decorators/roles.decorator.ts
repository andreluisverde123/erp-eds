import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/// Exige que o usuário possua ao menos um dos papéis informados (ex.: nome do
/// Role no Prisma: "Administrador", "Engenharia", "Compras", "Financeiro", "RH").
/// Use quando a regra de acesso é por papel. Para regras mais granulares,
/// prefira `RequirePermissions`.
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

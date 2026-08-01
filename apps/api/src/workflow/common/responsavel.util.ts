import type { PrismaService } from '../../prisma/prisma.service';

type Actor = { id: string; name: string };

/// Fallback usado quando a entidade não tem nenhum campo de "dono"/solicitante
/// (hoje só o caso de Employee em RH): responsável = autor do evento mais
/// recente em AuditLog pra essa entidade, ou nulo se ainda não há nenhum.
///
/// Versão em lote — uma única query pra uma página inteira, em vez de uma
/// query por linha. `distinct: ['entityId']` + `orderBy: createdAt desc`
/// vira um `DISTINCT ON` no Postgres, então retorna exatamente o evento mais
/// recente de cada entidade num só round-trip.
export async function resolveLastActorsAsResponsavelBatch(
  prisma: PrismaService,
  companyId: string,
  entityType: string,
  entityIds: string[],
): Promise<Map<string, Actor | null>> {
  const result = new Map<string, Actor | null>(entityIds.map((id) => [id, null]));
  if (entityIds.length === 0) return result;

  const lastEvents = await prisma.auditLog.findMany({
    where: { companyId, entityType, entityId: { in: entityIds } },
    orderBy: { createdAt: 'desc' },
    distinct: ['entityId'],
    select: { entityId: true, user: { select: { id: true, name: true } } },
  });

  for (const event of lastEvents) {
    result.set(event.entityId, event.user);
  }

  return result;
}

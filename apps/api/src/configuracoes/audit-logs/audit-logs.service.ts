import { Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_LOG_MODULES } from './audit-log-modules.constant';
import { QueryAuditLogDto } from './dto/query-audit-log.dto';

const includeArgs = Prisma.validator<Prisma.AuditLogDefaultArgs>()({
  include: { user: { select: { id: true, name: true, email: true } } },
});

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    query: QueryAuditLogDto,
  ): Promise<PaginatedResult<Prisma.AuditLogGetPayload<typeof includeArgs>>> {
    const { page, limit, userId, module, action, dateFrom, dateTo } = query;

    const where: Prisma.AuditLogWhereInput = {
      companyId,
      userId,
      action,
      entityType: module ? { in: AUDIT_LOG_MODULES[module] ?? [] } : undefined,
      createdAt:
        dateFrom || dateTo
          ? {
              gte: dateFrom ? new Date(dateFrom) : undefined,
              lte: dateTo ? new Date(dateTo) : undefined,
            }
          : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        ...includeArgs,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  getModules(): string[] {
    return Object.keys(AUDIT_LOG_MODULES);
  }

  /// Histórico de UM registro (não paginado — o histórico de um único
  /// registro não costuma passar de dezenas de linhas), mais antigo primeiro
  /// pra alimentar a timeline em ordem cronológica.
  async findForEntity(
    companyId: string,
    entityType: string,
    entityId: string,
  ): Promise<Prisma.AuditLogGetPayload<typeof includeArgs>[]> {
    return this.prisma.auditLog.findMany({
      where: { companyId, entityType, entityId },
      ...includeArgs,
      orderBy: { createdAt: 'asc' },
    });
  }
}

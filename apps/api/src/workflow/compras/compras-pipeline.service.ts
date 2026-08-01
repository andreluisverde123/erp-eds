import { NotFoundException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { buildTimeline, type TimelineEntry } from '../common/timeline.util';
import { deriveComprasStage, type ComprasStage } from '../common/stage.util';

const listSelect = {
  id: true,
  code: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  requestedBy: { select: { id: true, name: true } },
  // Destino da solicitação. Era a obra; virou o centro de custo quando a obra
  // saiu do formulário e passou a poder ser nula.
  costCenter: { select: { id: true, name: true } },
  purchaseOrders: {
    where: { deletedAt: null },
    select: {
      id: true,
      status: true,
      invoices: { where: { deletedAt: null }, select: { id: true, status: true } },
    },
  },
} as const;

export interface ComprasPipelineListRow {
  id: string;
  code: string;
  stage: ComprasStage;
  requestedBy: { id: string; name: string };
  costCenter: { id: string; name: string };
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ComprasPipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<ComprasPipelineListRow>> {
    const { page, limit } = query;
    const where = { companyId, deletedAt: null };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.purchaseRequest.findMany({
        where,
        select: listSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);

    const data = rows.map((row) => ({
      id: row.id,
      code: row.code,
      stage: deriveComprasStage(row, row.purchaseOrders),
      requestedBy: row.requestedBy,
      costCenter: row.costCenter,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const request = await this.prisma.purchaseRequest.findFirst({
      where: { id, companyId, deletedAt: null },
      select: {
        ...listSelect,
        purchaseOrders: {
          where: { deletedAt: null },
          select: {
            id: true,
            code: true,
            status: true,
            updatedAt: true,
            invoices: {
              where: { deletedAt: null },
              select: { id: true, number: true, status: true, updatedAt: true },
            },
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Solicitação não encontrada.');
    }

    const stage = deriveComprasStage(request, request.purchaseOrders);

    const purchaseOrderIds = request.purchaseOrders.map((order) => order.id);
    const invoiceIds = request.purchaseOrders.flatMap((order) =>
      order.invoices.map((invoice) => invoice.id),
    );

    const realEvents = await this.prisma.auditLog.findMany({
      where: {
        companyId,
        OR: [
          { entityType: 'PurchaseRequest', entityId: id },
          purchaseOrderIds.length > 0
            ? { entityType: 'PurchaseOrder', entityId: { in: purchaseOrderIds } }
            : undefined,
          invoiceIds.length > 0
            ? { entityType: 'Invoice', entityId: { in: invoiceIds } }
            : undefined,
        ].filter((clause): clause is NonNullable<typeof clause> => Boolean(clause)),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        entityType: true,
        action: true,
        changes: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    });

    const fallbackSince = request.purchaseOrders.reduce(
      (latest, order) => (order.updatedAt > latest ? order.updatedAt : latest),
      request.updatedAt,
    );

    const timeline: TimelineEntry[] = buildTimeline(realEvents, stage, fallbackSince);

    return {
      id: request.id,
      code: request.code,
      stage,
      status: request.status,
      requestedBy: request.requestedBy,
      costCenter: request.costCenter,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      purchaseOrders: request.purchaseOrders,
      timeline,
    };
  }
}

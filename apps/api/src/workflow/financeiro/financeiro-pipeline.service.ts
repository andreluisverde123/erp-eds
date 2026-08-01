import { Injectable, NotFoundException } from '@nestjs/common';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { PrismaService } from '../../prisma/prisma.service';
import { buildTimeline, type TimelineEntry } from '../common/timeline.util';
import { deriveFinanceiroStage, type FinanceiroStage } from '../common/stage.util';

const listSelect = {
  id: true,
  number: true,
  series: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  supplier: { select: { id: true, legalName: true, tradeName: true } },
  purchaseOrder: {
    select: {
      id: true,
      purchaseRequest: { select: { id: true, requestedBy: { select: { id: true, name: true } } } },
    },
  },
  accountsPayable: { where: { deletedAt: null }, select: { id: true, status: true } },
} as const;

export interface FinanceiroPipelineListRow {
  id: string;
  number: string;
  series: string | null;
  stage: FinanceiroStage;
  supplier: { id: string; legalName: string; tradeName: string | null };
  responsavel: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class FinanceiroPipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<FinanceiroPipelineListRow>> {
    const { page, limit } = query;
    const where = { companyId, deletedAt: null };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        select: listSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    const data = rows.map((row) => ({
      id: row.id,
      number: row.number,
      series: row.series,
      stage: deriveFinanceiroStage(row, row.accountsPayable),
      supplier: row.supplier,
      responsavel: row.purchaseOrder.purchaseRequest.requestedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId, deletedAt: null },
      select: {
        ...listSelect,
        accountsPayable: {
          where: { deletedAt: null },
          select: {
            id: true,
            status: true,
            amount: true,
            dueDate: true,
            updatedAt: true,
            payments: {
              where: { deletedAt: null },
              select: { id: true, amount: true, status: true, paidAt: true },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Nota fiscal não encontrada.');
    }

    const stage = deriveFinanceiroStage(invoice, invoice.accountsPayable);
    const accountPayableIds = invoice.accountsPayable.map((accountPayable) => accountPayable.id);

    const realEvents = await this.prisma.auditLog.findMany({
      where: {
        companyId,
        OR: [
          { entityType: 'Invoice', entityId: id },
          accountPayableIds.length > 0
            ? { entityType: 'AccountPayable', entityId: { in: accountPayableIds } }
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

    const fallbackSince = invoice.accountsPayable.reduce(
      (latest, accountPayable) =>
        accountPayable.updatedAt > latest ? accountPayable.updatedAt : latest,
      invoice.updatedAt,
    );

    const timeline: TimelineEntry[] = buildTimeline(realEvents, stage, fallbackSince);

    return {
      id: invoice.id,
      number: invoice.number,
      series: invoice.series,
      stage,
      status: invoice.status,
      supplier: invoice.supplier,
      responsavel: invoice.purchaseOrder.purchaseRequest.requestedBy,
      responsavelOrigin: 'via requisição de origem' as const,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      accountsPayable: invoice.accountsPayable,
      timeline,
    };
  }
}

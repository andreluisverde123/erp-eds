import { Injectable, NotFoundException } from '@nestjs/common';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveLastActorsAsResponsavelBatch } from '../common/responsavel.util';
import { buildTimeline, type TimelineEntry } from '../common/timeline.util';
import { deriveRhStage, type RhStage } from '../common/stage.util';

const listSelect = {
  id: true,
  name: true,
  position: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { allocations: true, productionEntries: true } },
} as const;

export interface RhPipelineListRow {
  id: string;
  name: string;
  position: string;
  stage: RhStage;
  responsavel: { id: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class RhPipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<RhPipelineListRow>> {
    const { page, limit } = query;
    const where = { companyId, deletedAt: null };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        select: listSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employee.count({ where }),
    ]);

    const responsaveis = await resolveLastActorsAsResponsavelBatch(
      this.prisma,
      companyId,
      'Employee',
      rows.map((row) => row.id),
    );

    const data = rows.map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      stage: deriveRhStage(row, row._count.allocations > 0, row._count.productionEntries > 0),
      responsavel: responsaveis.get(row.id) ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { ...listSelect, terminationDate: true },
    });

    if (!employee) {
      throw new NotFoundException('Funcionário não encontrado.');
    }

    const stage = deriveRhStage(
      employee,
      employee._count.allocations > 0,
      employee._count.productionEntries > 0,
    );

    const realEvents = await this.prisma.auditLog.findMany({
      where: { companyId, entityType: 'Employee', entityId: id },
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

    const timeline: TimelineEntry[] = buildTimeline(realEvents, stage, employee.updatedAt);
    const responsavel =
      realEvents.length > 0 ? (realEvents[realEvents.length - 1]?.user ?? null) : null;

    return {
      id: employee.id,
      name: employee.name,
      position: employee.position,
      stage,
      status: employee.status,
      terminationDate: employee.terminationDate,
      hasAllocation: employee._count.allocations > 0,
      hasProduction: employee._count.productionEntries > 0,
      responsavel,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
      timeline,
    };
  }
}

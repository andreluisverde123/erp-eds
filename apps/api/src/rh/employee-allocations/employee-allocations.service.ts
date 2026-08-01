import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeAllocationDto } from './dto/create-employee-allocation.dto';
import { QueryEmployeeAllocationDto } from './dto/query-employee-allocation.dto';
import { UpdateEmployeeAllocationDto } from './dto/update-employee-allocation.dto';

const includeArgs = Prisma.validator<Prisma.EmployeeAllocationDefaultArgs>()({
  include: {
    employee: { select: { id: true, name: true, cpf: true, position: true } },
    constructionSite: { select: { id: true, code: true, name: true } },
    costCenter: { select: { id: true, code: true, name: true } },
  },
});

@Injectable()
export class EmployeeAllocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateEmployeeAllocationDto) {
    await this.assertEmployee(companyId, dto.employeeId);
    await this.assertConstructionContext(companyId, dto.constructionSiteId, dto.costCenterId);
    this.assertDateRange(dto.startDate, dto.endDate);

    const created = await this.prisma.employeeAllocation.create({
      data: {
        employeeId: dto.employeeId,
        constructionSiteId: dto.constructionSiteId,
        costCenterId: dto.costCenterId,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    });

    return this.findOne(companyId, created.id);
  }

  async findAll(
    companyId: string,
    query: QueryEmployeeAllocationDto,
  ): Promise<PaginatedResult<Prisma.EmployeeAllocationGetPayload<typeof includeArgs>>> {
    const { page, limit, employeeId, constructionSiteId } = query;

    const where: Prisma.EmployeeAllocationWhereInput = {
      deletedAt: null,
      employeeId,
      constructionSiteId,
      employee: { companyId },
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employeeAllocation.findMany({
        where,
        ...includeArgs,
        orderBy: { startDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employeeAllocation.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const allocation = await this.prisma.employeeAllocation.findFirst({
      where: { id, deletedAt: null, employee: { companyId } },
      ...includeArgs,
    });

    if (!allocation) {
      throw new NotFoundException('Alocação não encontrada.');
    }

    return allocation;
  }

  async update(companyId: string, id: string, dto: UpdateEmployeeAllocationDto) {
    const existing = await this.assertExists(companyId, id);

    if (dto.costCenterId !== undefined) {
      await this.assertConstructionContext(
        companyId,
        existing.constructionSiteId,
        dto.costCenterId,
      );
    }

    const effectiveStart = dto.startDate ?? existing.startDate.toISOString();
    const effectiveEnd =
      dto.endDate !== undefined ? dto.endDate : (existing.endDate?.toISOString() ?? undefined);
    this.assertDateRange(effectiveStart, effectiveEnd);

    await this.prisma.employeeAllocation.update({
      where: { id, employee: { companyId } },
      data: {
        costCenterId: dto.costCenterId,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate:
          dto.endDate !== undefined ? (dto.endDate ? new Date(dto.endDate) : null) : undefined,
      },
    });

    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.assertExists(companyId, id);
    await this.prisma.employeeAllocation.update({
      where: { id, employee: { companyId } },
      data: { deletedAt: new Date() },
    });
  }

  private async assertEmployee(companyId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
    });
    if (!employee) {
      throw new BadRequestException('Funcionário informado não existe.');
    }
  }

  private async assertConstructionContext(
    companyId: string,
    constructionSiteId: string,
    costCenterId?: string,
  ) {
    const constructionSite = await this.prisma.constructionSite.findFirst({
      where: { id: constructionSiteId, companyId, deletedAt: null },
    });
    if (!constructionSite) {
      throw new BadRequestException('Obra informada não existe.');
    }

    if (!costCenterId) return;

    const costCenter = await this.prisma.costCenter.findFirst({
      where: { id: costCenterId, companyId, deletedAt: null },
      select: { constructionSiteId: true },
    });

    if (!costCenter) {
      throw new BadRequestException('Centro de custo informado não existe.');
    }

    if (costCenter.constructionSiteId !== constructionSiteId) {
      throw new BadRequestException('O centro de custo informado não pertence à obra selecionada.');
    }
  }

  private assertDateRange(startDate: string, endDate?: string) {
    if (endDate && new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException('A data de fim não pode ser anterior à data de início.');
    }
  }

  private async assertExists(companyId: string, id: string) {
    const allocation = await this.prisma.employeeAllocation.findFirst({
      where: { id, deletedAt: null, employee: { companyId } },
    });
    if (!allocation) {
      throw new NotFoundException('Alocação não encontrada.');
    }
    return allocation;
  }
}

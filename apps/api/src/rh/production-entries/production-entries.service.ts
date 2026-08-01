import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductionEntryDto } from './dto/create-production-entry.dto';
import { QueryProductionEntryDto } from './dto/query-production-entry.dto';
import { UpdateProductionEntryDto } from './dto/update-production-entry.dto';

const includeArgs = Prisma.validator<Prisma.ProductionEntryDefaultArgs>()({
  include: {
    employee: { select: { id: true, name: true, cpf: true } },
    constructionSite: { select: { id: true, code: true, name: true } },
    costCenter: { select: { id: true, code: true, name: true } },
  },
});

@Injectable()
export class ProductionEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateProductionEntryDto) {
    await this.assertEmployee(companyId, dto.employeeId);
    await this.assertConstructionContext(companyId, dto.constructionSiteId, dto.costCenterId);

    const created = await this.prisma.productionEntry.create({
      data: {
        employeeId: dto.employeeId,
        constructionSiteId: dto.constructionSiteId,
        costCenterId: dto.costCenterId,
        date: new Date(dto.date),
        description: dto.description,
        quantity: dto.quantity,
        unit: dto.unit,
      },
    });

    return this.findOne(companyId, created.id);
  }

  async findAll(
    companyId: string,
    query: QueryProductionEntryDto,
  ): Promise<PaginatedResult<Prisma.ProductionEntryGetPayload<typeof includeArgs>>> {
    const { page, limit, employeeId, constructionSiteId, dateFrom, dateTo } = query;

    const where: Prisma.ProductionEntryWhereInput = {
      deletedAt: null,
      employeeId,
      constructionSiteId,
      employee: { companyId },
      date:
        dateFrom || dateTo
          ? {
              gte: dateFrom ? new Date(dateFrom) : undefined,
              lte: dateTo ? new Date(dateTo) : undefined,
            }
          : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.productionEntry.findMany({
        where,
        ...includeArgs,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productionEntry.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const productionEntry = await this.prisma.productionEntry.findFirst({
      where: { id, deletedAt: null, employee: { companyId } },
      ...includeArgs,
    });

    if (!productionEntry) {
      throw new NotFoundException('Apontamento de produção não encontrado.');
    }

    return productionEntry;
  }

  async update(companyId: string, id: string, dto: UpdateProductionEntryDto) {
    await this.assertExists(companyId, id);

    if (dto.constructionSiteId || dto.costCenterId) {
      const existing = await this.prisma.productionEntry.findUniqueOrThrow({
        where: { id, employee: { companyId } },
      });
      await this.assertConstructionContext(
        companyId,
        dto.constructionSiteId ?? existing.constructionSiteId,
        dto.costCenterId ?? existing.costCenterId ?? undefined,
      );
    }

    await this.prisma.productionEntry.update({
      where: { id, employee: { companyId } },
      data: {
        constructionSiteId: dto.constructionSiteId,
        costCenterId: dto.costCenterId,
        date: dto.date ? new Date(dto.date) : undefined,
        description: dto.description,
        quantity: dto.quantity,
        unit: dto.unit,
      },
    });

    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.assertExists(companyId, id);
    await this.prisma.productionEntry.update({
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

  private async assertExists(companyId: string, id: string) {
    const productionEntry = await this.prisma.productionEntry.findFirst({
      where: { id, deletedAt: null, employee: { companyId } },
    });
    if (!productionEntry) {
      throw new NotFoundException('Apontamento de produção não encontrado.');
    }
    return productionEntry;
  }
}

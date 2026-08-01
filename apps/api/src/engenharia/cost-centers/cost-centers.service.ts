import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { QueryCostCenterDto } from './dto/query-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';

const detailArgs = Prisma.validator<Prisma.CostCenterDefaultArgs>()({
  include: { constructionSite: { select: { id: true, code: true, name: true } } },
});

export type CostCenterDetail = Prisma.CostCenterGetPayload<typeof detailArgs>;

const DUPLICATE_CODE_MESSAGE = 'Já existe um centro de custo com este código.';

@Injectable()
export class CostCentersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateCostCenterDto): Promise<CostCenterDetail> {
    if (dto.constructionSiteId) {
      await this.assertConstructionSiteExists(companyId, dto.constructionSiteId);
    }

    try {
      const created = await this.prisma.costCenter.create({
        data: {
          companyId,
          code: dto.code,
          name: dto.name,
          description: dto.description,
          constructionSiteId: dto.constructionSiteId,
        },
      });

      return this.findOne(companyId, created.id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_CODE_MESSAGE);
      }
      throw error;
    }
  }

  async findAll(
    companyId: string,
    query: QueryCostCenterDto,
  ): Promise<PaginatedResult<CostCenterDetail>> {
    const { page, limit, search, constructionSiteId } = query;

    const where: Prisma.CostCenterWhereInput = {
      companyId,
      deletedAt: null,
      constructionSiteId,
      OR: search
        ? [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.costCenter.findMany({
        where,
        ...detailArgs,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.costCenter.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string): Promise<CostCenterDetail> {
    const costCenter = await this.prisma.costCenter.findFirst({
      where: { id, companyId, deletedAt: null },
      ...detailArgs,
    });

    if (!costCenter) {
      throw new NotFoundException('Centro de custo não encontrado.');
    }

    return costCenter;
  }

  async update(companyId: string, id: string, dto: UpdateCostCenterDto): Promise<CostCenterDetail> {
    await this.findOne(companyId, id);

    if (dto.constructionSiteId) {
      await this.assertConstructionSiteExists(companyId, dto.constructionSiteId);
    }

    try {
      await this.prisma.costCenter.update({
        where: { id, companyId },
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description,
          constructionSiteId: dto.constructionSiteId,
        },
      });

      return this.findOne(companyId, id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_CODE_MESSAGE);
      }
      throw error;
    }
  }

  async remove(companyId: string, id: string): Promise<void> {
    const costCenter = await this.findOne(companyId, id);
    await this.prisma.costCenter.update({
      where: { id, companyId },
      data: { deletedAt: new Date(), code: mangleDeletedCode(costCenter.code, costCenter.id) },
    });
  }

  private async assertConstructionSiteExists(
    companyId: string,
    constructionSiteId: string,
  ): Promise<void> {
    const exists = await this.prisma.constructionSite.findFirst({
      where: { id: constructionSiteId, companyId, deletedAt: null },
      select: { id: true },
    });

    if (!exists) {
      throw new BadRequestException('Obra informada não existe.');
    }
  }
}
